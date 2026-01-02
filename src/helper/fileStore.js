import { extname } from 'path';
import { unlink, rm } from 'fs/promises';

/**
 * Write the image in public folder with given fileName and path
 * @param {string} fileName the name of the image
 * @param {string} path the path of the image
 * @param {import('express-fileupload').File} file the image file
 * @returns {Promise<string>} the path of the written image
 */
export async function fileStore(fileName, path, file) {
    const fileExtension = extname(file.name);
    const filePathName = `public/${path}/${fileName + fileExtension}`;
    return new Promise((resolve, reject) => {
        file.mv(filePathName, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(filePathName);
            }
        });
    });
}




/**
 * Delete a file at the given path
 * @param {string} filePath - The path of the file to delete
 * @returns {Promise<void>}
 */
export async function deleteFile(filePath) {
    try {
        try {
            await unlink(filePath);

        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    } catch (error) {
        console.error(`Failed to delete file at ${filePath}:`, error);
        throw error;
    }
}


export async function deletePath(path) {
    try {
        await rm(`public/${path}`, { recursive: true, force: true });
        console.log(`Successfully deleted: ${path}`);
    } catch (error) {
        console.error(`Failed to delete path at ${path}:`, error);
        throw error;
    }
}