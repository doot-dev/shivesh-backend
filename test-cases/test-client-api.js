#!/usr/bin/env node

/**
 * Client API Test Script
 * Tests all client endpoints with sample data and PDF uploads
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3001/api/v1/admin';
let authToken = '';
let testClientId = '';

// Colors for console output
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

async function test1_getToken() {
  logSection('TEST 1: Get Authentication Token');
  const result = await makeRequest('/token?userId=1&role=ADMIN', 'GET', null, false);

  if (result.status === 200 && result.data.success) {
    authToken = result.data.data.token;
    log('✓ Token generated successfully', 'green');
    log(`Token: ${authToken.substring(0, 50)}...`, 'blue');
    return true;
  } else {
    log('✗ Failed to get token', 'red');
    console.log(result.data);
    return false;
  }
}

async function test2_createClient() {
  logSection('TEST 2: Create Client with KYC Documents');

  // Simulate PDF files from testdocs
  const testDocsPath = path.join(__dirname, 'testdocs');
  const pdfFiles = fs.readdirSync(testDocsPath).filter(f => f.endsWith('.pdf'));

  log(`Found ${pdfFiles.length} PDF files in testdocs`, 'blue');

  const kycDocuments = pdfFiles.slice(0, 3).map((file, index) => ({
    fileName: file,
    fileUrl: `/testdocs/${file}`,
    type: ['pan', 'aadhaar', 'gst'][index] || 'other'
  }));

  const clientData = {
    companyName: 'Test Company Pvt Ltd',
    ownerName: 'John Doe',
    contactNumber: '9876543210',
    email: `test${Date.now()}@example.com`,
    hasGST: true,
    gstNumber: `27AABCU9603R1Z${Math.floor(Math.random() * 10)}`,
    ownerPan: 'ABCDE1234F',
    ownerAadhaar: '123456789012',
    password: 'Test@123456',
    address: '123 Test Street, Mumbai, Maharashtra, 400001',
    kycDocuments
  };

  const result = await makeRequest('/client/create', 'POST', clientData);

  if (result.status === 201 && result.data.success) {
    testClientId = result.data.clientId;
    log('✓ Client created successfully', 'green');
    log(`Client ID: ${testClientId}`, 'blue');
    log(`KYC Documents uploaded: ${kycDocuments.length}`, 'blue');
    return true;
  } else {
    log('✗ Failed to create client', 'red');
    console.log(result.data);
    return false;
  }
}

async function test3_getClientList() {
  logSection('TEST 3: Get Client List');
  const result = await makeRequest('/client/list?page=1&limit=10');

  if (result.status === 200 && result.data.success) {
    log('✓ Client list retrieved successfully', 'green');
    log(`Total clients: ${result.data.total}`, 'blue');
    log(`Clients on page: ${result.data.data.length}`, 'blue');
    return true;
  } else {
    log('✗ Failed to get client list', 'red');
    console.log(result.data);
    return false;
  }
}

async function test4_getClientDetails() {
  logSection('TEST 4: Get Client Details');
  if (!testClientId) {
    log('⚠ Skipping: No test client ID available', 'yellow');
    return false;
  }

  const result = await makeRequest(`/client/${testClientId}`);

  if (result.status === 200 && result.data.success) {
    log('✓ Client details retrieved successfully', 'green');
    log(`Company: ${result.data.data.companyName}`, 'blue');
    log(`Owner: ${result.data.data.ownerName}`, 'blue');
    log(`KYC Documents: ${result.data.data.kycDocuments.length}`, 'blue');
    return true;
  } else {
    log('✗ Failed to get client details', 'red');
    console.log(result.data);
    return false;
  }
}

async function test5_uploadAdditionalKYC() {
  logSection('TEST 5: Upload Additional KYC Documents');
  if (!testClientId) {
    log('⚠ Skipping: No test client ID available', 'yellow');
    return false;
  }

  const testDocsPath = path.join(__dirname, 'testdocs');
  const pdfFiles = fs.readdirSync(testDocsPath).filter(f => f.endsWith('.pdf'));

  const uploadedFiles = pdfFiles.slice(3, 5).map(file => ({
    fileName: file,
    fileUrl: `/testdocs/${file}`,
    type: 'other'
  }));

  if (uploadedFiles.length === 0) {
    log('⚠ No additional PDF files to upload', 'yellow');
    return false;
  }

  const result = await makeRequest('/client/upload-kyc', 'POST', {
    clientId: testClientId,
    uploadedFiles
  });

  if (result.status === 200 && result.data.success) {
    log('✓ Additional KYC documents uploaded successfully', 'green');
    log(`Documents uploaded: ${result.data.uploaded.length}`, 'blue');
    return true;
  } else {
    log('✗ Failed to upload additional KYC', 'red');
    console.log(result.data);
    return false;
  }
}

async function test6_updateClient() {
  logSection('TEST 6: Update Client');
  if (!testClientId) {
    log('⚠ Skipping: No test client ID available', 'yellow');
    return false;
  }

  const updateData = {
    companyName: 'Updated Test Company Pvt Ltd',
    ownerName: 'John Doe Updated',
    contactNumber: '9876543211',
    email: `updated${Date.now()}@example.com`,
    hasGST: true,
    gstNumber: `27AABCU9603R1Z${Math.floor(Math.random() * 10)}`,
    address: '456 Updated Street, Mumbai, Maharashtra, 400002'
  };

  const result = await makeRequest(`/client/${testClientId}`, 'PUT', updateData);

  if (result.status === 200 && result.data.success) {
    log('✓ Client updated successfully', 'green');
    return true;
  } else {
    log('✗ Failed to update client', 'red');
    console.log(result.data);
    return false;
  }
}

async function test7_searchClients() {
  logSection('TEST 7: Search Clients');
  const result = await makeRequest('/client/list?search=Test&page=1&limit=10');

  if (result.status === 200 && result.data.success) {
    log('✓ Client search successful', 'green');
    log(`Results found: ${result.data.total}`, 'blue');
    return true;
  } else {
    log('✗ Failed to search clients', 'red');
    console.log(result.data);
    return false;
  }
}

async function test8_deleteKYCDocument() {
  logSection('TEST 8: Delete KYC Document');
  if (!testClientId) {
    log('⚠ Skipping: No test client ID available', 'yellow');
    return false;
  }

  // First get client details to get a document ID
  const clientResult = await makeRequest(`/client/${testClientId}`);

  if (!clientResult.data.success || clientResult.data.data.kycDocuments.length === 0) {
    log('⚠ No KYC documents to delete', 'yellow');
    return false;
  }

  const docId = clientResult.data.data.kycDocuments[0].docId;
  const result = await makeRequest(`/client/${testClientId}/kyc/${docId}`, 'DELETE');

  if (result.status === 200 && result.data.success) {
    log('✓ KYC document deleted successfully', 'green');
    return true;
  } else {
    log('✗ Failed to delete KYC document', 'red');
    console.log(result.data);
    return false;
  }
}

async function test9_deleteClient() {
  logSection('TEST 9: Delete Client (Soft Delete)');
  if (!testClientId) {
    log('⚠ Skipping: No test client ID available', 'yellow');
    return false;
  }

  const result = await makeRequest(`/client/${testClientId}`, 'DELETE');

  if (result.status === 200 && result.data.success) {
    log('✓ Client deleted successfully', 'green');
    return true;
  } else {
    log('✗ Failed to delete client', 'red');
    console.log(result.data);
    return false;
  }
}

async function runAllTests() {
  log('\n🚀 Starting Client API Tests', 'cyan');
  log(`Base URL: ${BASE_URL}`, 'blue');

  const results = [];

  // Run tests sequentially
  results.push(await test1_getToken());
  if (!authToken) {
    log('\n❌ Cannot proceed without authentication token', 'red');
    return;
  }

  results.push(await test2_createClient());
  results.push(await test3_getClientList());
  results.push(await test4_getClientDetails());
  results.push(await test5_uploadAdditionalKYC());
  results.push(await test6_updateClient());
  results.push(await test7_searchClients());
  results.push(await test8_deleteKYCDocument());
  results.push(await test9_deleteClient());

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
  } else {
    log('\n⚠ Some tests failed', 'yellow');
  }
}

// Run tests
runAllTests().catch(error => {
  log('\n❌ Test suite failed with error:', 'red');
  console.error(error);
  process.exit(1);
});
