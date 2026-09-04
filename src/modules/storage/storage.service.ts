import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { AppConfig } from '../../config/configuration';

const UPLOAD_URL_EXPIRY_SECONDS = 15 * 60;
const DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60;

export interface ObjectMetadata {
  size: number;
  contentType: string;
  lastModified: Date;
}

// Uses the `minio` package's own client directly rather than @aws-sdk/client-s3
// — there's no real AWS S3 account to test the AWS-SDK path against yet, so
// this targets MinIO specifically for now (see docs/08-storage.md for the
// eventual AWS-SDK-for-both intent once real S3 credentials exist).
function buildClient(
  endpoint: string,
  region: string,
  accessKey: string,
  secretKey: string,
): MinioClient {
  const endpointUrl = new URL(endpoint);
  return new MinioClient({
    endPoint: endpointUrl.hostname,
    port:
      Number(endpointUrl.port) ||
      (endpointUrl.protocol === 'https:' ? 443 : 80),
    useSSL: endpointUrl.protocol === 'https:',
    // Without this, the SDK calls GetBucketLocation against the endpoint to
    // discover the region on first use — the publicClient's endpoint isn't
    // reachable from inside the container, so that call would ECONNREFUSED.
    region,
    accessKey,
    secretKey,
  });
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  // Talks to MinIO over the internal Docker network hostname (e.g. `minio:9000`)
  // for the backend's own object operations.
  private readonly client: MinioClient;
  // Signs presigned URLs against the host/port a browser or mobile client
  // outside Docker can actually reach (e.g. `localhost:57900`). Docker-compose
  // overrides S3_ENDPOINT to the internal hostname, which gets baked verbatim
  // into whatever client signs the URL — signing with `client` here would
  // hand out unreachable `http://minio:9000/...` URLs to external callers.
  private readonly publicClient: MinioClient;
  private readonly bucket: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const storage = config.get('storage', { infer: true });
    this.bucket = storage.bucket;

    this.client = buildClient(
      storage.endpoint,
      storage.region,
      storage.accessKey,
      storage.secretKey,
    );
    this.publicClient =
      storage.publicEndpoint === storage.endpoint
        ? this.client
        : buildClient(
            storage.publicEndpoint,
            storage.region,
            storage.accessKey,
            storage.secretKey,
          );
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created storage bucket "${this.bucket}"`);
      }
    } catch (error) {
      this.logger.error(
        'Could not verify/create storage bucket on startup',
        error,
      );
    }
  }

  async createPresignedUploadUrl(
    key: string,
    expiresIn = UPLOAD_URL_EXPIRY_SECONDS,
  ): Promise<string> {
    return this.publicClient.presignedPutObject(this.bucket, key, expiresIn);
  }

  async createPresignedDownloadUrl(
    key: string,
    expiresIn = DOWNLOAD_URL_EXPIRY_SECONDS,
  ): Promise<string> {
    return this.publicClient.presignedGetObject(this.bucket, key, expiresIn);
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async getObjectMetadata(key: string): Promise<ObjectMetadata | null> {
    try {
      const stat = await this.client.statObject(this.bucket, key);
      return {
        size: stat.size,
        contentType: (stat.metaData?.['content-type'] as string) ?? '',
        lastModified: stat.lastModified,
      };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
