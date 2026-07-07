const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.searchAll = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim() === '') {
            return res.json({ users: [], videos: [], sessions: [] });
        }

        const searchQuery = q.trim();

        // Search Users
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { display_name: { contains: searchQuery } },
                    { unique_handle: { contains: searchQuery } }
                ]
            },
            select: {
                id: true,
                display_name: true,
                unique_handle: true,
                avatar_url: true,
                follower_count: true,
                is_verified: true
            },
            take: 10
        });

        // Search Sessions (Live or Recorded)
        const sessions = await prisma.liveSession.findMany({
            where: {
                OR: [
                    { title: { contains: searchQuery } },
                    { description: { contains: searchQuery } },
                    { category: { contains: searchQuery } }
                ]
            },
            include: {
                host: {
                    select: {
                        id: true,
                        display_name: true,
                        unique_handle: true,
                        avatar_url: true
                    }
                }
            },
            take: 20,
            orderBy: {
                created_at: 'desc'
            }
        });

        const videos = await prisma.video.findMany({
            where: {
                visibility: 'public',
                OR: [
                    { title: { contains: searchQuery } },
                    { description: { contains: searchQuery } },
                    { tags: { has: searchQuery } },
                    { category: { name: { contains: searchQuery } } }
                ]
            },
            include: {
                owner: {
                    select: {
                        id: true,
                        display_name: true,
                        unique_handle: true,
                        avatar_url: true,
                        is_verified: true
                    }
                },
                category: true
            },
            take: 20,
            orderBy: { upload_date: 'desc' }
        });

        res.json({
            users,
            videos: videos.map((video) => ({
                ...video,
                filesize: video.filesize?.toString?.() || video.filesize,
                views: video.views?.toString?.() || video.views,
                watch_time: video.watch_time?.toString?.() || video.watch_time
            })),
            sessions
        });
    } catch (error) {
        console.error("Search Error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
