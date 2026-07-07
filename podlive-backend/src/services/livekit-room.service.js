const { RoomServiceClient } = require('livekit-server-sdk');

const hasLiveKitConfig = () => Boolean(
    process.env.LIVEKIT_URL &&
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET
);

const getRoomClient = () => {
    if (!hasLiveKitConfig()) {
        throw new Error('LiveKit credentials are required');
    }

    return new RoomServiceClient(
        process.env.LIVEKIT_URL,
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET
    );
};

const listParticipants = async (roomName) => {
    const client = getRoomClient();
    return client.listParticipants(roomName);
};

const removeParticipant = async (roomName, identity) => {
    const client = getRoomClient();
    return client.removeParticipant(roomName, identity);
};

const updateParticipantPermissions = async (roomName, identity, permission) => {
    const client = getRoomClient();
    return client.updateParticipant(roomName, identity, {
        permission: {
            canPublish: permission.canPublish,
            canSubscribe: permission.canSubscribe,
            canPublishData: permission.canPublishData
        }
    });
};

module.exports = {
    hasLiveKitConfig,
    listParticipants,
    removeParticipant,
    updateParticipantPermissions
};
