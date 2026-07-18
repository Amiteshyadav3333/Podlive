const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const serializeUser = (user) => {
    if (!user) return user;
    const { password_hash, ...safeUser } = user;
    return {
        ...safeUser,
        total_views: safeUser.total_views?.toString?.() || safeUser.total_views,
        total_likes: safeUser.total_likes?.toString?.() || safeUser.total_likes,
        videos: safeUser.videos?.map((video) => ({
            ...video,
            filesize: video.filesize?.toString?.() || video.filesize,
            views: video.views?.toString?.() || video.views,
            watch_time: video.watch_time?.toString?.() || video.watch_time
        }))
    };
};

// Get Host Settings
exports.getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { profile: true }
        });
        res.json(serializeUser(user));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

// Update Host Settings
exports.updateProfile = async (req, res) => {
    try {
        const { display_name, bio, avatar_url, cover_image_url, links, location, language } = req.body;
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                ...(display_name !== undefined ? { display_name } : {}),
                ...(bio !== undefined ? { bio } : {}),
                ...(avatar_url !== undefined ? { avatar_url } : {}),
                ...(cover_image_url !== undefined ? { cover_image_url } : {}),
                ...(links !== undefined ? { links } : {}),
                profile: {
                    upsert: {
                        create: {
                            bio,
                            profile_photo: avatar_url,
                            cover_image: cover_image_url,
                            links,
                            location,
                            language
                        },
                        update: {
                            ...(bio !== undefined ? { bio } : {}),
                            ...(avatar_url !== undefined ? { profile_photo: avatar_url } : {}),
                            ...(cover_image_url !== undefined ? { cover_image: cover_image_url } : {}),
                            ...(links !== undefined ? { links } : {}),
                            ...(location !== undefined ? { location } : {}),
                            ...(language !== undefined ? { language } : {})
                        }
                    }
                }
            },
            include: { profile: true }
        });
        res.json({ message: 'Profile updated', user: serializeUser(user) });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

// Get Audience Stats
exports.getAudienceStats = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { hosted_sessions: true }
        });

        // Calculate stats
        const totalLives = user.hosted_sessions.length;
        const totalViews = user.hosted_sessions.reduce((acc, curr) => acc + curr.viewer_count_peak, 0);
        const videoStats = await prisma.video.aggregate({
            where: { owner_id: req.user.id },
            _sum: { views: true, likes: true, watch_time: true },
            _count: { id: true }
        });

        res.json({
            followers: user.follower_count,
            following: user.following_count,
            subscribers: user.subscriber_count,
            totalLives,
            totalVideos: videoStats._count.id,
            totalViews: (videoStats._sum.views || BigInt(totalViews)).toString(),
            totalLikes: videoStats._sum.likes || 0,
            totalWatchTime: (videoStats._sum.watch_time || BigInt(0)).toString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch audience stats' });
    }
};

// Get Past Recordings
exports.getRecordings = async (req, res) => {
    try {
        const sessions = await prisma.liveSession.findMany({
            where: {
                host_user_id: req.user.id,
                status: 'ended',
                recording_url: { not: null }
            },
            include: {
                video: {
                    select: {
                        id: true,
                        thumbnail: true,
                        processing_status: true,
                        duration_seconds: true,
                        views: true,
                        likes: true
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });

        // Serialize BigInt values
        const serialized = sessions.map(s => ({
            ...s,
            video: s.video ? {
                ...s.video,
                views: s.video.views?.toString?.() || s.video.views
            } : null
        }));
        res.json(serialized);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
};

// Get Creator Public Profile
exports.getCreatorProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const creator = await prisma.user.findUnique({
            where: { id },
            include: {
                profile: true,
                videos: {
                    where: {
                        visibility: 'public',
                        processing_status: { in: ['ready', 'processing'] }
                    },
                    orderBy: { upload_date: 'desc' },
                    take: 30
                },
                hosted_sessions: {
                    include: {
                        video: {
                            select: {
                                duration_seconds: true
                            }
                        }
                    },
                    orderBy: { created_at: 'desc' }
                }
            }
        });

        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        const totalLives = creator.hosted_sessions.length;
        const totalViews = creator.hosted_sessions.reduce((acc, curr) => acc + curr.viewer_count_peak, 0);
        const recordings = creator.hosted_sessions.filter(s => s.status === 'ended');

        // We don't want to expose the password hash
        res.json({
            ...serializeUser(creator),
            totalLives,
            totalViews,
            recordings
        });
    } catch (error) {
        console.error("Error fetching creator profile:", error);
        res.status(500).json({ error: 'Failed to fetch creator profile' });
    }
};

// Toggle Follow/Unfollow
exports.toggleFollow = async (req, res) => {
    try {
        const followerId = req.user.id;
        const followingId = req.body.creatorId;

        if (followerId === followingId) {
            return res.status(400).json({ error: "You cannot follow yourself" });
        }

        const existingFollow = await prisma.follows.findUnique({
            where: {
                follower_id_following_id: {
                    follower_id: followerId,
                    following_id: followingId
                }
            }
        });

        if (existingFollow) {
            // Unfollow
            await prisma.follows.delete({
                where: { id: existingFollow.id }
            });
            const updatedProfile = await prisma.user.update({
                where: { id: followingId },
                data: { follower_count: { decrement: 1 } }
            });
            await prisma.user.update({
                where: { id: followerId },
                data: { following_count: { decrement: 1 } }
            });

            // Update followers in REAL-TIME via Socket Room (userId room)
            if (req.io) {
                req.io.to(followingId).emit('follower_count_update', { count: updatedProfile.follower_count });
            }

            res.json({ following: false, follower_count: updatedProfile.follower_count });
        } else {
            // Follow
            await prisma.follows.create({
                data: {
                    follower_id: followerId,
                    following_id: followingId
                }
            });
            const updatedProfile = await prisma.user.update({
                where: { id: followingId },
                data: { follower_count: { increment: 1 } }
            });
            await prisma.user.update({
                where: { id: followerId },
                data: { following_count: { increment: 1 } }
            });

            // Update followers in REAL-TIME via Socket Room (userId room)
            if (req.io) {
                req.io.to(followingId).emit('follower_count_update', { count: updatedProfile.follower_count });
            }

            res.json({ following: true, follower_count: updatedProfile.follower_count });
        }
    } catch (error) {
        console.error("Toggle follow error:", error);
        res.status(500).json({ error: 'Failed to toggle follow status' });
    }
};

// Get Follow Status
exports.getFollowStatus = async (req, res) => {
    try {
        const followerId = req.user.id;
        const followingId = req.params.creatorId;

        const existingFollow = await prisma.follows.findUnique({
            where: {
                follower_id_following_id: {
                    follower_id: followerId,
                    following_id: followingId
                }
            }
        });

        res.json({ following: !!existingFollow });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch follow status' });
    }
};
