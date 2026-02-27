const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({
    forcePathStyle: true,
    region: process.env.S3_REGION || 'ap-south-1',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
    }
});

exports.uploadFileToS3 = async (filePath, destinationKey, contentType) => {
    try {
        const fileStream = fs.createReadStream(filePath);

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: destinationKey,
                Body: fileStream,
                ContentType: contentType,
            },
        });

        await upload.done();
        return `${process.env.S3_PUBLIC_URL}/${destinationKey}`;
    } catch (error) {
        console.error("S3 Upload Error for file " + filePath + ":", error);
        throw error;
    }
};

exports.uploadBufferToS3 = async (buffer, destinationKey, contentType) => {
    try {
        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: destinationKey,
                Body: buffer,
                ContentType: contentType,
            },
        });

        await upload.done();
        return `${process.env.S3_PUBLIC_URL}/${destinationKey}`;
    } catch (error) {
        console.error("S3 Buffer Upload Error:", error);
        throw error;
    }
};
