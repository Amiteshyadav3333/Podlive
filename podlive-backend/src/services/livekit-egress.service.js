const {
    EgressClient,
    IngressClient,
    IngressInput,
    SegmentedFileOutput,
    SegmentedFileProtocol,
    S3Upload
} = require('livekit-server-sdk');

const isEnabled = (value) => String(value || '').toLowerCase() === 'true';

const hasLiveKitConfig = () => Boolean(
    process.env.LIVEKIT_URL &&
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET
);

const getStorageConfig = () => {
    const bunnyEndpoint = process.env.BUNNY_STORAGE_ENDPOINT ||
        (process.env.BUNNY_STORAGE_REGION ? `https://${process.env.BUNNY_STORAGE_REGION}-s3.storage.bunnycdn.com` : null);

    if (
        bunnyEndpoint &&
        process.env.BUNNY_STORAGE_REGION &&
        process.env.BUNNY_STORAGE_ZONE &&
        process.env.BUNNY_STORAGE_PASSWORD &&
        process.env.BUNNY_STORAGE_PUBLIC_URL
    ) {
        return {
            accessKey: process.env.BUNNY_STORAGE_ZONE,
            secret: process.env.BUNNY_STORAGE_PASSWORD,
            region: process.env.BUNNY_STORAGE_REGION,
            endpoint: bunnyEndpoint,
            bucket: process.env.BUNNY_STORAGE_ZONE,
            publicUrl: process.env.BUNNY_STORAGE_PUBLIC_URL.replace(/\/+$/, '')
        };
    }

    if (
        process.env.S3_ENDPOINT &&
        process.env.S3_REGION &&
        process.env.S3_ACCESS_KEY &&
        process.env.S3_SECRET_KEY &&
        process.env.S3_BUCKET_NAME &&
        process.env.S3_PUBLIC_URL
    ) {
        return {
            accessKey: process.env.S3_ACCESS_KEY,
            secret: process.env.S3_SECRET_KEY,
            region: process.env.S3_REGION,
            endpoint: process.env.S3_ENDPOINT,
            bucket: process.env.S3_BUCKET_NAME,
            publicUrl: process.env.S3_PUBLIC_URL.replace(/\/+$/, '')
        };
    }

    return null;
};

const hasStorageConfig = () => Boolean(getStorageConfig());

const isHlsEgressEnabled = () => (
    isEnabled(process.env.ENABLE_LIVEKIT_HLS_EGRESS) &&
    hasLiveKitConfig() &&
    hasStorageConfig()
);

const isIngressEnabled = () => (
    isEnabled(process.env.ENABLE_LIVEKIT_INGRESS) &&
    hasLiveKitConfig()
);

const getEgressClient = () => {
    if (!hasLiveKitConfig()) {
        throw new Error('LiveKit credentials are required');
    }

    return new EgressClient(
        process.env.LIVEKIT_URL,
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET
    );
};

const getIngressClient = () => {
    if (!hasLiveKitConfig()) {
        throw new Error('LiveKit credentials are required');
    }

    return new IngressClient(
        process.env.LIVEKIT_URL,
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET
    );
};

const buildS3Upload = () => {
    const storage = getStorageConfig();
    if (!storage) {
        throw new Error('S3-compatible storage credentials are required');
    }

    return new S3Upload({
        accessKey: storage.accessKey,
        secret: storage.secret,
        region: storage.region,
        endpoint: storage.endpoint,
        bucket: storage.bucket,
        forcePathStyle: true
    });
};

const getLiveHlsUrl = (sessionId) => {
    const storage = getStorageConfig();
    if (!storage?.publicUrl) return null;
    return `${storage.publicUrl}/live/${sessionId}/live.m3u8`;
};

const getRecordingHlsUrl = (sessionId) => {
    const storage = getStorageConfig();
    if (!storage?.publicUrl) return null;
    return `${storage.publicUrl}/live/${sessionId}/index.m3u8`;
};

const startRoomHlsEgress = async (session) => {
    if (!isHlsEgressEnabled()) {
        return null;
    }

    const client = getEgressClient();
    const output = new SegmentedFileOutput({
        protocol: SegmentedFileProtocol.HLS_PROTOCOL,
        filenamePrefix: `live/${session.id}/segment`,
        playlistName: `live/${session.id}/index.m3u8`,
        livePlaylistName: `live/${session.id}/live.m3u8`,
        segmentDuration: Number(process.env.LIVE_HLS_SEGMENT_SECONDS || 2),
        output: {
            case: 's3',
            value: buildS3Upload()
        }
    });

    return client.startRoomCompositeEgress(session.livekit_room_name, output, {
        layout: process.env.LIVEKIT_EGRESS_LAYOUT || 'grid'
    });
};

const stopEgress = async (egressId) => {
    if (!egressId || !hasLiveKitConfig()) {
        return null;
    }

    const client = getEgressClient();
    return client.stopEgress(egressId);
};

const createIngress = async (session, type = 'rtmp') => {
    if (!isIngressEnabled()) {
        return null;
    }

    const client = getIngressClient();
    const inputType = type === 'whip' ? IngressInput.WHIP_INPUT : IngressInput.RTMP_INPUT;

    return client.createIngress(inputType, {
        name: `podlive-${session.id}`,
        roomName: session.livekit_room_name,
        participantIdentity: `ingress-${session.id}`,
        participantName: `${session.title} Stream`,
        enableTranscoding: true
    });
};

const deleteIngress = async (ingressId) => {
    if (!ingressId || !hasLiveKitConfig()) {
        return null;
    }

    const client = getIngressClient();
    return client.deleteIngress(ingressId);
};

module.exports = {
    createIngress,
    deleteIngress,
    getLiveHlsUrl,
    getRecordingHlsUrl,
    isHlsEgressEnabled,
    isIngressEnabled,
    startRoomHlsEgress,
    stopEgress
};
