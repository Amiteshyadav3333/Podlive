const {
    IngressClient,
    IngressInput
} = require('livekit-server-sdk');

const isEnabled = (value) => String(value || '').toLowerCase() === 'true';

const hasLiveKitConfig = () => Boolean(
    process.env.LIVEKIT_URL &&
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET
);

const isIngressEnabled = () => (
    isEnabled(process.env.ENABLE_LIVEKIT_INGRESS) &&
    hasLiveKitConfig()
);

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
    isIngressEnabled
};
