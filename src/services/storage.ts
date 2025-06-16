import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata,
  updateMetadata,
  UploadResult,
  UploadTask,
  StorageReference,
  FullMetadata
} from 'firebase/storage';
import { storage } from '../lib/firebase';

// Types for upload progress and results
export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  state: 'paused' | 'running' | 'success' | 'error';
}

export interface StorageFile {
  name: string;
  fullPath: string;
  downloadURL: string;
  size: number;
  contentType?: string;
  timeCreated: string;
  updated: string;
  customMetadata?: Record<string, string>;
}

// Storage path generators
export const StoragePaths = {
  userProfile: (userId: string, fileName: string) =>
    `users/${userId}/profile/${fileName}`,

  brandAsset: (userId: string, brandId: string, fileName: string) =>
    `users/${userId}/brands/${brandId}/${fileName}`,

  document: (userId: string, documentId: string, fileName: string) =>
    `users/${userId}/documents/${documentId}/${fileName}`,

  tempUpload: (userId: string, fileName: string) =>
    `users/${userId}/temp/${fileName}`,

  export: (userId: string, fileName: string) =>
    `users/${userId}/exports/${fileName}`
};

// Main Storage Service
export class StorageService {
  // Upload file with progress tracking
  static uploadFile(
    path: string,
    file: File,
    metadata?: Record<string, string>,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<{ downloadURL: string; metadata: FullMetadata }> {
    return new Promise((resolve, reject) => {
      console.log('📁 Uploading to path:', path);
      console.log('👤 Current user from storage context:', storage.app.options);
      const storageRef = ref(storage, path);
      const customMetadata = {
        originalName: file.name,
        uploadedBy: 'user',
        uploadedAt: new Date().toISOString(),
        ...metadata
      };

      const uploadTask = uploadBytesResumable(storageRef, file, {
        customMetadata,
        contentType: file.type
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (onProgress) {
            const progress: UploadProgress = {
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
              percentage: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
              state: snapshot.state as any
            };
            onProgress(progress);
          }
        },
        (error) => {
          console.error('Upload failed:', error);
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            const fileMetadata = await getMetadata(uploadTask.snapshot.ref);
            resolve({ downloadURL, metadata: fileMetadata });
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }

  // Simple upload without progress tracking
  static async uploadFileSimple(
    path: string,
    file: File,
    metadata?: Record<string, string>
  ): Promise<{ downloadURL: string; metadata: FullMetadata }> {
    const storageRef = ref(storage, path);
    const customMetadata = {
      originalName: file.name,
      uploadedBy: 'user',
      uploadedAt: new Date().toISOString(),
      ...metadata
    };

    const result = await uploadBytes(storageRef, file, {
      customMetadata,
      contentType: file.type
    });

    const downloadURL = await getDownloadURL(result.ref);
    const fileMetadata = await getMetadata(result.ref);

    return { downloadURL, metadata: fileMetadata };
  }

  // Get download URL for existing file
  static async getDownloadURL(path: string): Promise<string> {
    const storageRef = ref(storage, path);
    return await getDownloadURL(storageRef);
  }

  // Delete file
  static async deleteFile(path: string): Promise<void> {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  }

  // List files in a directory
  static async listFiles(dirPath: string): Promise<StorageFile[]> {
    const storageRef = ref(storage, dirPath);
    const result = await listAll(storageRef);

    const files: StorageFile[] = [];

    for (const item of result.items) {
      try {
        const [downloadURL, metadata] = await Promise.all([
          getDownloadURL(item),
          getMetadata(item)
        ]);

        files.push({
          name: item.name,
          fullPath: item.fullPath,
          downloadURL,
          size: metadata.size,
          contentType: metadata.contentType,
          timeCreated: metadata.timeCreated,
          updated: metadata.updated,
          customMetadata: metadata.customMetadata
        });
      } catch (error) {
        console.warn(`Failed to get metadata for ${item.fullPath}:`, error);
      }
    }

    return files;
  }

  // Get file metadata
  static async getFileMetadata(path: string): Promise<FullMetadata> {
    const storageRef = ref(storage, path);
    return await getMetadata(storageRef);
  }

  // Update file metadata
  static async updateFileMetadata(
    path: string,
    metadata: Record<string, string>
  ): Promise<FullMetadata> {
    const storageRef = ref(storage, path);
    return await updateMetadata(storageRef, { customMetadata: metadata });
  }

  // Check if file exists
  static async fileExists(path: string): Promise<boolean> {
    try {
      const storageRef = ref(storage, path);
      await getMetadata(storageRef);
      return true;
    } catch (error: any) {
      if (error.code === 'storage/object-not-found') {
        return false;
      }
      throw error;
    }
  }
}

// Specialized services for different file types
export class ProfileImageService {
  static async uploadProfileImage(
    userId: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<string> {
    // Ensure it's an image
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are allowed for profile pictures');
    }

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Profile image must be less than 5MB');
    }

    const path = StoragePaths.userProfile(userId, `profile.${file.type.split('/')[1]}`);
    const { downloadURL } = await StorageService.uploadFile(path, file, {
      type: 'profile-image'
    }, onProgress);

    return downloadURL;
  }

  static async getProfileImageURL(userId: string, extension: string = 'jpg'): Promise<string | null> {
    try {
      const path = StoragePaths.userProfile(userId, `profile.${extension}`);
      return await StorageService.getDownloadURL(path);
    } catch (error: any) {
      if (error.code === 'storage/object-not-found') {
        return null;
      }
      throw error;
    }
  }

  static async deleteProfileImage(userId: string, extension: string = 'jpg'): Promise<void> {
    const path = StoragePaths.userProfile(userId, `profile.${extension}`);
    await StorageService.deleteFile(path);
  }
}

export class BrandAssetService {
  static async uploadBrandAsset(
    userId: string,
    brandId: string,
    file: File,
    assetType: 'logo' | 'style-guide' | 'sample' | 'other',
    onProgress?: (progress: UploadProgress) => void
  ): Promise<string> {
    // Check file size (25MB limit)
    if (file.size > 25 * 1024 * 1024) {
      throw new Error('Brand asset must be less than 25MB');
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = StoragePaths.brandAsset(userId, brandId, `${assetType}_${timestamp}_${safeName}`);

    const { downloadURL } = await StorageService.uploadFile(path, file, {
      type: 'brand-asset',
      assetType,
      brandId
    }, onProgress);

    return downloadURL;
  }

  static async listBrandAssets(userId: string, brandId: string): Promise<StorageFile[]> {
    const dirPath = `users/${userId}/brands/${brandId}`;
    return await StorageService.listFiles(dirPath);
  }

  static async deleteBrandAsset(userId: string, brandId: string, fileName: string): Promise<void> {
    const path = StoragePaths.brandAsset(userId, brandId, fileName);
    await StorageService.deleteFile(path);
  }
}

export class DocumentService {
  static async uploadDocument(
    userId: string,
    documentId: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<string> {
    // Check file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      throw new Error('Document must be less than 50MB');
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = StoragePaths.document(userId, documentId, `${timestamp}_${safeName}`);

    const { downloadURL } = await StorageService.uploadFile(path, file, {
      type: 'document',
      documentId
    }, onProgress);

    return downloadURL;
  }

  static async listDocumentFiles(userId: string, documentId: string): Promise<StorageFile[]> {
    const dirPath = `users/${userId}/documents/${documentId}`;
    return await StorageService.listFiles(dirPath);
  }

  static async deleteDocumentFile(userId: string, documentId: string, fileName: string): Promise<void> {
    const path = StoragePaths.document(userId, documentId, fileName);
    await StorageService.deleteFile(path);
  }
}

// Utility functions
export const StorageUtils = {
  // Format file size for display
  formatFileSize: (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // Validate file type
  isValidImageType: (file: File): boolean => {
    return file.type.startsWith('image/');
  },

  isValidDocumentType: (file: File): boolean => {
    const validTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    return validTypes.includes(file.type) || file.type.startsWith('text/');
  },

  // Generate unique filename
  generateUniqueFileName: (originalName: string, prefix?: string): string => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return prefix ? `${prefix}_${timestamp}_${randomId}_${safeName}` : `${timestamp}_${randomId}_${safeName}`;
  }
};
