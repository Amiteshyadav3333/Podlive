const { AccessToken } = require('livekit-server-sdk');
const jwt = require('jsonwebtoken');
const at = new AccessToken('devkey', 'secret', { identity: 'test1' });
at.addGrant({ roomJoin: true, room: 'room1', canPublish: false, canSubscribe: true, canPublishData: true });
const token = at.toJwt();
token.then(t => {
    console.log(jwt.decode(t).video);
});
