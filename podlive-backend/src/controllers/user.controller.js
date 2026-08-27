const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { syncMonetizationAccount } = require('../services/monetization.service');

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
        const { display_name, bio, avatar_url, cover_image_url, links, location, language, birth_date } = req.body;
        const parsedBirthDate = birth_date ? new Date(birth_date) : null;
        if (birth_date && (Number.isNaN(parsedBirthDate.getTime()) || parsedBirthDate > new Date())) {
            return res.status(400).json({ error: 'Invalid birth date' });
        }
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
                            language,
                            birth_date: parsedBirthDate
                        },
                        update: {
                            ...(bio !== undefined ? { bio } : {}),
                            ...(avatar_url !== undefined ? { profile_photo: avatar_url } : {}),
                            ...(cover_image_url !== undefined ? { cover_image: cover_image_url } : {}),
                            ...(links !== undefined ? { links } : {}),
                            ...(location !== undefined ? { location } : {}),
                            ...(language !== undefined ? { language } : {}),
                            ...(birth_date !== undefined ? { birth_date: parsedBirthDate } : {})
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

exports.getMonetization = async (req, res) => {
    try {
        const monetization = await syncMonetizationAccount(prisma, req.user.id);
        if (!monetization) return res.status(404).json({ error: 'User not found' });
        res.setHeader('Cache-Control', 'private, no-store');
        res.json({ monetization });
    } catch (error) {
        console.error('Fetch monetization error:', error);
        res.status(500).json({ error: 'Failed to fetch monetization details' });
    }
};

exports.getCreatorDashboard = async (req, res) => {
    try {
        const userId = req.user.id;
        const videos = await prisma.video.findMany({
            where: { owner_id: userId },
            select: {
                id: true,
                title: true,
                thumbnail: true,
                upload_date: true,
                visibility: true,
                processing_status: true,
                duration_seconds: true,
                views: true,
                likes: true,
                dislikes: true,
                comments_count: true,
                watch_time: true
            },
            orderBy: { upload_date: 'desc' }
        });
        const videoIds = videos.map((video) => video.id);
        const [viewGroups, ageGroups, monetization] = await Promise.all([
            videoIds.length ? prisma.view.groupBy({
                by: ['video_id'],
                where: { video_id: { in: videoIds }, qualified: true },
                _count: { _all: true }
            }) : [],
            videoIds.length ? prisma.view.groupBy({
                by: ['age_group'],
                where: { video_id: { in: videoIds }, qualified: true, age_group: { not: null } },
                _count: { _all: true }
            }) : [],
            syncMonetizationAccount(prisma, userId)
        ]);
        const qualifiedByVideo = new Map(viewGroups.map((group) => [group.video_id, group._count._all]));
        const paisePerView = Math.max(Number(process.env.MONETIZATION_PAISE_PER_QUALIFIED_VIEW || 3), 0);
        const totals = videos.reduce((result, video) => ({
            views: result.views + Number(video.views),
            likes: result.likes + video.likes,
            comments: result.comments + video.comments_count,
            watchSeconds: result.watchSeconds + Number(video.watch_time)
        }), { views: 0, likes: 0, comments: 0, watchSeconds: 0 });

        res.setHeader('Cache-Control', 'private, no-store');
        res.json({
            overview: {
                videos: videos.length,
                views: totals.views,
                likes: totals.likes,
                comments: totals.comments,
                watchHours: Number((totals.watchSeconds / 3600).toFixed(1)),
                estimatedBalanceRupees: Number(((monetization?.account?.estimatedBalancePaise || 0) / 100).toFixed(2)),
                lifetimeEarningsRupees: Number(((monetization?.account?.lifetimeEarningsPaise || 0) / 100).toFixed(2)),
                monetizationStatus: monetization?.status || 'ineligible'
            },
            audience: {
                ageGroups: ageGroups
                    .filter((group) => group._count._all >= 5)
                    .map((group) => ({ ageGroup: group.age_group, viewers: group._count._all })),
                minimumAudienceSize: 5
            },
            videos: videos.map((video) => {
                const qualifiedViews = qualifiedByVideo.get(video.id) || 0;
                return {
                    ...video,
                    views: video.views.toString(),
                    watchTimeSeconds: video.watch_time.toString(),
                    watchHours: Number((Number(video.watch_time) / 3600).toFixed(1)),
                    qualifiedViews,
                    estimatedRevenueRupees: monetization?.status === 'active'
                        ? Number(((qualifiedViews * paisePerView) / 100).toFixed(2))
                        : 0,
                    watch_time: undefined
                };
            })
        });
    } catch (error) {
        console.error('Fetch creator dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch creator dashboard' });
    }
};

// Get Audience Stats
exports.getAudienceStats = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { hosted_sessions: true }
        });

        if (!user) {
            return res.json({
                followers: 0,
                following: 0,
                subscribers: 0,
                totalLives: 0,
                totalVideos: 0,
                totalViews: "0",
                totalLikes: 0,
                totalWatchTime: "0"
            });
        }

        // Calculate stats
        const totalLives = user.hosted_sessions?.length || 0;
        const totalViews = user.hosted_sessions?.reduce((acc, curr) => acc + (curr.viewer_count_peak || 0), 0) || 0;
        const videoStats = await prisma.video.aggregate({
            where: { owner_id: userId },
            _sum: { views: true, likes: true, watch_time: true },
            _count: { id: true }
        });

        res.json({
            followers: user.follower_count || 0,
            following: user.following_count || 0,
            subscribers: user.subscriber_count || 0,
            totalLives,
            totalVideos: videoStats._count.id || 0,
            totalViews: (videoStats._sum.views || BigInt(totalViews)).toString(),
            totalLikes: videoStats._sum.likes || 0,
            totalWatchTime: (videoStats._sum.watch_time || BigInt(0)).toString()
        });
    } catch (error) {
        console.error('Fetch audience stats error:', error);
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
