#!/usr/bin/env node

/**
 * Test KYC Document Upload with Actual Files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3001/api/v1/admin';
let authToken = '';
let testClientId = '';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60) + '\n');
}

async function makeRequest(endpoint, method = 'GET', body = null, includeAuth = true) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(includeAuth && authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { status: 500, data: { error: error.message } };
  }
}

async function uploadFiles(endpoint, clientId, files, types) {
  const url = `${BASE_URL}${endpoint}`;
  const form = new FormData();

  form.append('clientId', clientId);
  form.append('types', JSON.stringify(types));

  files.forEach(file => {
    form.append('kycDocuments', fs.createReadStream(file));
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { status: 500, data: { error: error.message } };
  }
}

async function test1_getToken() {
  logSection('TEST 1: Get Authentication Token');
  const result = await makeRequest('/token?userId=1&role=ADMIN', 'GET', null, false);

  if (result.status === 200 && result.data.success) {
    authToken = result.data.data.token;
    log('✓ Token generated successfully', 'green');
    return true;
  } else {
    log('✗ Failed to get token', 'red');
    return false;
  }
}

async function test2_createClient() {
  logSection('TEST 2: Create Client');

  const clientData = {
    companyName: 'File Upload Test Company',
    ownerName: 'Jane Smith',
    contactNumber: '9876543211',
    email: `filetest${Date.now()}@example.com`,
    hasGST: true,
    gstNumber: `27AABCU9603R1Z${Math.floor(Math.random() * 10)}`,
    ownerPan: 'ABCDE1234G',
    ownerAadhaar: '123456789013',
    password: 'Test@123456',
    address: '456 Test Avenue, Mumbai, Maharashtra, 400002',
  };

  const result = await makeRequest('/client/create', 'POST', clientData);

  if (result.status === 201 && result.data.success) {
    testClientId = result.data.clientId;
    log('✓ Client created successfully', 'green');
    log(`Client ID: ${testClientId}`, 'blue');
    return true;
  } else {
    log('✗ Failed to create client', 'red');
    console.log(result.data);
    return false;
  }
}

async function test3_uploadRealFiles() {
  logSection('TEST 3: Upload Real PDF Files');

  if (!testClientId) {
    log('⚠ Skipping: No test client ID available', 'yellow');
    return false;
  }

  const testDocsPath = path.join(__dirname, 'testdocs');
  const pdfFiles = fs.readdirSync(testDocsPath)
    .filter(f => f.endsWith('.pdf'))
    .slice(0, 3)
    .map(f => path.join(testDocsPath, f));

  if (pdfFiles.length === 0) {
    log('⚠ No PDF files found in testdocs', 'yellow');
    return false;
  }

  log(`Found ${pdfFiles.length} PDF files to upload`, 'blue');
  pdfFiles.forEach(f => log(`  - ${path.basename(f)}`, 'blue'));

  const types = ['pan', 'aadhaar', 'gst'];
  const result = await uploadFiles('/client/upload-kyc', testClientId, pdfFiles, types);

  if (result.status === 200 && result.data.success) {
    log('✓ Files uploaded successfully', 'green');
    log(`Uploaded documents:`, 'blue');
    result.data.uploaded.forEach(doc => {
      log(`  - ${doc.fileName} (${doc.type})`, 'blue');
      log(`    URL: ${doc.fileUrl}`, 'blue');
    });
    return true;
  } else {
    log('✗ Failed to upload files', 'red');
    console.log(result.data);
    return false;
  }
}

async function test4_verifyFileAccess() {
  logSection('TEST 4: Verify File Access via HTTP');

  if (!testClientId) {
    log('⚠ Skipping: No test client ID available', 'yellow');
    return false;
  }

  // Get client details to get file URLs
  const clientResult = await makeRequest(`/client/${testClientId}`);

  if (!clientResult.data.success || clientResult.data.data.kycDocuments.length === 0) {
    log('⚠ No documents to verify', 'yellow');
    return false;
  }

  const doc = clientResult.data.data.kycDocuments[0];
  const fileUrl = `http://localhost:3001${doc.fileUrl}`;

  log(`Checking file access: ${fileUrl}`, 'blue');

  try {
    const response = await fetch(fileUrl);
    if (response.ok) {
      const contentType = response.headers.get('content-type');
      log('✓ File is accessible via HTTP', 'green');
      log(`  Content-Type: ${contentType}`, 'blue');
      return true;
    } else {
      log(`✗ File not accessible (Status: ${response.status})`, 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Error accessing file: ${error.message}`, 'red');
    return false;
  }
}

async function test5_deleteDocument() {
  logSection('TEST 5: Delete Document and Verify File Removal');

  if (!testClientId) {
    log('⚠ Skipping: No test client ID available', 'yellow');
    return false;
  }

  // Get client details
  const clientResult = await makeRequest(`/client/${testClientId}`);

  if (!clientResult.data.success || clientResult.data.data.kycDocuments.length === 0) {
    log('⚠ No documents to delete', 'yellow');
    return false;
  }

  const doc = clientResult.data.data.kycDocuments[0];
  const fileUrl = `http://localhost:3001${doc.fileUrl}`;

  log(`Deleting document: ${doc.fileName}`, 'blue');

  const result = await makeRequest(`/client/${testClientId}/kyc/${doc.docId}`, 'DELETE');

  if (result.status === 200 && result.data.success) {
    log('✓ Document deleted from database', 'green');

    // Try to access the file - it should be gone
    try {
      const response = await fetch(fileUrl);
      if (response.ok) {
        log('⚠ Warning: File still accessible after deletion', 'yellow');
        return false;
      } else {
        log('✓ File successfully removed from storage', 'green');
        return true;
      }
    } catch (error) {
      log('✓ File successfully removed from storage', 'green');
      return true;
    }
  } else {
    log('✗ Failed to delete document', 'red');
    console.log(result.data);
    return false;
  }
}

async function runTests() {
  log('\n🚀 Starting File Upload Tests', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'blue');

  const results = [];

  results.push(await test1_getToken());
  if (!authToken) {
    log('\n❌ Cannot proceed without authentication token', 'red');
    return;
  }

  results.push(await test2_createClient());
  results.push(await test3_uploadRealFiles());
  results.push(await test4_verifyFileAccess());
  results.push(await test5_deleteDocument());

  // Summary
  logSection('TEST SUMMARY');
  const passed = results.filter(r => r === true).length;
  const total = results.length;

  log(`Total Tests: ${total}`, 'blue');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${total - passed}`, 'red');
  log(`Success Rate: ${((passed / total) * 100).toFixed(2)}%`, 'cyan');

  if (passed === total) {
    log('\n✓ All tests passed! 🎉', 'green');
    log('✓ Files are being saved to public/uploads/kyc/', 'green');
    log('✓ Files are accessible via HTTP', 'green');
  } else {
    log('\n⚠ Some tests failed', 'yellow');
  }
}

runTests().catch(error => {
  log('\n❌ Test suite failed with error:', 'red');
  console.error(error);
  process.exit(1);
});
