const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const activeUsers = new Map(); // userId -> socketId

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        socket.on('register_user', (userId) => {
            activeUsers.set(userId, socket.id);
            console.log(`User ${userId} registered with socket ${socket.id}`);
        });

        socket.on('send_invite', async ({ sessionId, inviteeHandle, hostId }) => {
            try {
                let handleFormated = inviteeHandle.trim();
                if (!handleFormated.startsWith('@')) handleFormated = '@' + handleFormated;

                const invitee = await prisma.user.findUnique({ where: { unique_handle: handleFormated } });
                const host = await prisma.user.findUnique({ where: { id: hostId } });

                if (!invitee) {
                    return socket.emit('invite_status', { success: false, message: "User not found." });
                }

                if (activeUsers.has(invitee.id)) {
                    io.to(activeUsers.get(invitee.id)).emit('receive_invite', {
                        sessionId,
                        host: host,
                    });
                    socket.emit('invite_status', { success: true, message: `Invite sent to ${handleFormated} successfully!` });
                } else {
                    socket.emit('invite_status', { success: false, message: `${handleFormated} is currently offline.` });
                }
            } catch (error) {
                console.error("Socket send_invite error:", error);
                socket.emit('invite_status', { success: false, message: "Internal server error." });
            }
        });

        socket.on('accept_invite', ({ sessionId, hostId, inviteeHandle }) => {
            if (activeUsers.has(hostId)) {
                io.to(activeUsers.get(hostId)).emit('invite_accepted', {
                    sessionId,
                    inviteeHandle
                });
            }
        });

        socket.on('reject_invite', ({ sessionId, hostId, inviteeHandle }) => {
            if (activeUsers.has(hostId)) {
                io.to(activeUsers.get(hostId)).emit('invite_rejected', {
                    sessionId,
                    inviteeHandle
                });
            }
        });

        socket.on('remove_guest', ({ guestId }) => {
            if (activeUsers.has(guestId)) {
                io.to(activeUsers.get(guestId)).emit('guest_removed');
            }
        });

        socket.on('mute_guest', ({ guestId }) => {
            if (activeUsers.has(guestId)) {
                io.to(activeUsers.get(guestId)).emit('guest_muted');
            }
        });

        // Chat functionality
        socket.on('join_chat_room', (sessionId) => {
            socket.join(sessionId);
        });

        socket.on('leave_chat_room', (sessionId) => {
            socket.leave(sessionId);
        });

        socket.on('send_chat_message', async ({ sessionId, senderHandle, message }) => {
            // Emit to clients immediately for real-time feel
            io.to(sessionId).emit('receive_chat_message', {
                senderHandle,
                message,
                created_at: new Date()
            });

            // Save to database
            try {
                await prisma.chatMessage.create({
                    data: {
                        session_id: sessionId,
                        sender_handle: senderHandle,
                        message: message
                    }
                });
            } catch (error) {
                console.error("Failed to save chatting message", error);
            }
        });

        socket.on('disconnect', () => {
            for (let [userId, socketId] of activeUsers.entries()) {
                if (socketId === socket.id) {
                    activeUsers.delete(userId);
                    break;
                }
            }
            console.log('User disconnected:', socket.id);
        });
    });
};
