<?php

declare(strict_types=1);

class FileUploader {
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'application/pdf' => 'pdf',
    ];

    private const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB limit

    public static function getUploadDirectory(): string {
        $uploadDir = __DIR__ . '/../../storage/uploads/documents';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0750, true);
        }
        return realpath($uploadDir) ?: $uploadDir;
    }

    public static function store(array $file): array {
        if (!isset($file['error']) || is_array($file['error'])) {
            throw new InvalidArgumentException("Invalid file upload parameters.");
        }

        switch ($file['error']) {
            case UPLOAD_ERR_OK:
                break;
            case UPLOAD_ERR_NO_FILE:
                throw new InvalidArgumentException("No file was uploaded.");
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                throw new InvalidArgumentException("File exceeded maximum upload size.");
            default:
                throw new RuntimeException("Unknown error occurred during file upload.");
        }

        if ($file['size'] > self::MAX_FILE_SIZE_BYTES) {
            throw new InvalidArgumentException("File size exceeds 5MB limit.");
        }

        if (!file_exists($file['tmp_name'])) {
            throw new InvalidArgumentException("Uploaded file temporary path not found.");
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);

        if (!isset(self::ALLOWED_MIME_TYPES[$mimeType])) {
            throw new InvalidArgumentException("Invalid file type. Only JPG, PNG, and PDF files are permitted.");
        }

        $extension = self::ALLOWED_MIME_TYPES[$mimeType];
        $randomName = bin2hex(random_bytes(16)) . '.' . $extension;
        $targetDir = self::getUploadDirectory();
        $targetPath = $targetDir . DIRECTORY_SEPARATOR . $randomName;

        // Support both HTTP POST upload and direct test upload
        $saved = is_uploaded_file($file['tmp_name']) 
            ? move_uploaded_file($file['tmp_name'], $targetPath) 
            : copy($file['tmp_name'], $targetPath);

        if (!$saved) {
            throw new RuntimeException("Failed to save uploaded file to storage.");
        }

        return [
            'original_name' => basename($file['name']),
            'storage_path' => $targetPath,
            'file_size' => (int)$file['size'],
            'mime_type' => $mimeType,
        ];
    }
}
