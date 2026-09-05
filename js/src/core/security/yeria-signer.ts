import { createPublicKey, generateKeyPairSync, sign } from 'crypto';
import { Notification } from '../notification';
import { SecureNotificationResponse } from '../../types';
import { DecodedPayload, SignedEnvelope } from '../yeria-protocol';
import { stringifyForSigning } from '../../utils/signing-json';

export interface YeriaKeyPair {
    privateKey: string;
    publicKey: string;
}

/**
 * Ed25519 signer for a Yeria service. Holds the service's PRIVATE key and
 * produces the v3 signed envelopes the platform serves to renderers.
 *
 * Signs payloads, views and notifications: the signature is Ed25519 over the
 * raw payload string bytes. `signView` returns a `{payload, signature}`
 * SignedEnvelope; `signNotification` returns a SecureNotificationResponse.
 * `updateKeyPair()` supports in-place key rotation. One instance is owned and
 * shared by YeriaApp/YeriaUI.
 *
 * Not: this object only SIGNS — it is distinct from YeriaEnvelopeVerifier
 * (verifies provider view envelopes) and YeriaUserTokenVerifier (verifies
 * Yeria-issued user JWTs).
 */
export class YeriaSigner {
    private privateKey: string;
    private publicKey: string;

    constructor(keys: Partial<YeriaKeyPair> = {}) {
        if (keys.privateKey) {
            this.privateKey = keys.privateKey;
            this.publicKey = keys.publicKey
                ?? createPublicKey(keys.privateKey).export({ type: 'spki', format: 'pem' }) as string;
            return;
        }

        const keyPair = generateKeyPairSync('ed25519');
        this.privateKey = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
        this.publicKey = keyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    }

    /** The service's own public key (PEM) — derived from the private key. */
    getServicePublicKey(): string {
        return this.publicKey;
    }

    getPrivateKey(): string {
        return this.privateKey;
    }

    /** Replace the keypair in place — supports key rotation without a new instance. */
    updateKeyPair(keys: YeriaKeyPair): void {
        this.privateKey = keys.privateKey;
        this.publicKey = keys.publicKey;
    }

    /** Sign a raw string; returns the base64 Ed25519 signature over its UTF-8 bytes. */
    signPayload(payload: string): string {
        return sign(null, Buffer.from(payload, 'utf8'), this.privateKey).toString('base64');
    }

    /** Wrap a view in a v3 `{payload, signature}` envelope signed over the payload bytes. */
    signView(view: Record<string, unknown>, appId: string, timestamp: number = Date.now()): SignedEnvelope {
        const decoded: DecodedPayload = { appId, timestamp, view };
        const payload = stringifyForSigning(decoded);
        return { payload, signature: this.signPayload(payload) };
    }

    /** Sign a notification into a SecureNotificationResponse (signature over the payload bytes). */
    signNotification(
        notification: Notification,
        appId: string,
        timestamp: number = Date.now(),
        devKeyId?: string
    ): SecureNotificationResponse {
        const notificationJson = notification.toJSON();
        // `devKeyId` n'entre dans la charge signee QUE s'il existe : une
        // notification de production garde exactement la forme qu'elle avait,
        // sinon toutes celles deja en circulation cesseraient de verifier.
        const payload = stringifyForSigning(
            devKeyId
                ? { notification: notificationJson, timestamp, appId, devKeyId }
                : { notification: notificationJson, timestamp, appId }
        );

        const signed: SecureNotificationResponse = {
            appId,
            signature: this.signPayload(payload),
            timestamp,
            notification: notificationJson
        };
        if (devKeyId) signed.devKeyId = devKeyId;
        return signed;
    }
}
