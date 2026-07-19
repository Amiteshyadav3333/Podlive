const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Starting database cleanup...');

    // Delete child records first to satisfy foreign key constraints
    await prisma.stageInvite.deleteMany({});
    await prisma.chatMessage.deleteMany({});
    await prisma.like.deleteMany({});
    await prisma.videoLike.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.view.deleteMany({});
    await prisma.playlistVideo.deleteMany({});
    await prisma.playlist.deleteMany({});
    await prisma.history.deleteMany({});
    await prisma.report.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.subtitle.deleteMany({});
    await prisma.analytics.deleteMany({});
    await prisma.videoFile.deleteMany({});
    await prisma.thumbnail.deleteMany({});
    await prisma.video.deleteMany({});
    await prisma.liveSession.deleteMany({});
    await prisma.uploadSession.deleteMany({});
    await prisma.follows.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.profile.deleteMany({});
    await prisma.user.deleteMany({});

    console.log('Database successfully cleared! All old users and session data removed.');
}

main()
    .catch((e) => {
        console.error('Error clearing database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
