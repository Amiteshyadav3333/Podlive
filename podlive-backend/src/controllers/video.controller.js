const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

const toInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const toDateBucket = (date = new Date()) => {
    const bucket = new Date(date);
    bucket.setUTCHours(0, 0, 0, 0);
    return bucket;
};

const serializeVideo = (video) => {
    if (!video) return video;
    return {
        ...video,
        filesize: video.filesize?.toString?.() || video.filesize,
        views: video.views?.toString?.() || video.views,
        watch_time: video.watch_time?.toString?.() || video.watch_time
    };
};

const serializePlaylist = (playlist) => {
    if (!playlist) return playlist;
    return {
        ...playlist,
        videos: playlist.videos?.map((row) => ({
            ...row,
            video: serializeVideo(row.video)
        }))
    };
};

const publicVideoWhere = {
    visibility: 'public',
    processing_status: { in: ['ready', 'processing'] }
};

const canAccessVideo = (video, userId) => {
    if (!video) return false;
    return video.visibility === 'public' || video.visibility === 'unlisted' || video.owner_id === userId;
};

const getClientHash = (req) => {
    const raw = req.user?.id || req.body.deviceId || req.headers['x-device-id'] || req.ip || 'anonymous';
    return crypto.createHash('sha256').update(String(raw)).digest('hex');
};

exports.listVideos = async (req, res) => {
    try {
        const page = toInt(req.query.page, 1);
        const limit = Math.min(toInt(req.query.limit, 20), 50);
        const skip = (page - 1) * limit;
        const { category, ownerId, sort = 'latest' } = req.query;

        const where = {
            ...publicVideoWhere,
            ...(ownerId ? { owner_id: ownerId } : {}),
            ...(category ? { category: { slug: category } } : {})
        };

        const orderBy = sort === 'popular'
            ? [{ views: 'desc' }, { upload_date: 'desc' }]
            : [{ upload_date: 'desc' }];

        const [items, total] = await Promise.all([
            prisma.video.findMany({
                where,
                include: {
                    owner: {
                        select: {
                            id: true,
                            display_name: true,
                            unique_handle: true,
                            avatar_url: true,
                            is_verified: true,
                            subscriber_count: true
                        }
                    },
                    category: true
                },
                orderBy,
                skip,
                take: limit
            }),
            prisma.video.count({ where })
        ]);

        res.json({
            page,
            limit,
            total,
            videos: items.map(serializeVideo)
        });
    } catch (error) {
        console.error('[Videos] list error:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
};

exports.getVideo = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({
            where: { id: req.params.id },
            include: {
                owner: {
                    select: {
                        id: true,
                        display_name: true,
                        unique_handle: true,
                        avatar_url: true,
                        is_verified: true,
                        subscriber_count: true
                    }
                },
                category: true,
                files: { orderBy: { height: 'asc' } },
                thumbnails: true
            }
        });

        if (!canAccessVideo(video, req.user?.id)) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const [viewerReaction, subscription] = await Promise.all([
            req.user?.id ? prisma.videoLike.findUnique({
                where: { user_id_video_id: { user_id: req.user.id, video_id: video.id } }
            }) : null,
            req.user?.id ? prisma.subscription.findUnique({
                where: {
                    subscriber_id_subscribed_to_id: {
                        subscriber_id: req.user.id,
                        subscribed_to_id: video.owner_id
                    }
                }
            }) : null
        ]);

        res.json({
            video: serializeVideo(video),
            viewer: {
                reaction: viewerReaction?.reaction || null,
                subscribed: !!subscription
            }
        });
    } catch (error) {
        console.error('[Videos] detail error:', error);
        res.status(500).json({ error: 'Failed to fetch video' });
    }
};

exports.updateVideo = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!video || video.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const { title, description, tags, thumbnail, visibility, language, location, category } = req.body;
        const data = {
            ...(title !== undefined ? { title: String(title).trim() } : {}),
            ...(description !== undefined ? { description: description ? String(description).trim() : null } : {}),
            ...(Array.isArray(tags) ? { tags: tags.map((tag) => String(tag).trim()).filter(Boolean) } : {}),
            ...(thumbnail !== undefined ? { thumbnail } : {}),
            ...(visibility !== undefined ? { visibility } : {}),
            ...(language !== undefined ? { language } : {}),
            ...(location !== undefined ? { location } : {})
        };

        if (category) {
            const slug = String(category).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
            const cat = await prisma.category.upsert({
                where: { slug },
                update: {},
                create: { name: category, slug }
            });
            data.category_id = cat.id;
        }

        const updated = await prisma.video.update({
            where: { id: video.id },
            data,
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
                category: true,
                files: true,
                thumbnails: true
            }
        });

        res.json({ message: 'Video updated', video: serializeVideo(updated) });
    } catch (error) {
        console.error('[Videos] update error:', error);
        res.status(500).json({ error: 'Failed to update video' });
    }
};

exports.deleteVideo = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!video || video.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Video not found' });
        }

        await prisma.video.delete({ where: { id: video.id } });
        res.json({ message: 'Video deleted' });
    } catch (error) {
        console.error('[Videos] delete error:', error);
        res.status(500).json({ error: 'Failed to delete video' });
    }
};

exports.recordView = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!canAccessVideo(video, req.user?.id)) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const watchTime = Math.max(Number(req.body.watchTimeSeconds || 0), 0);
        const completionRate = Math.min(Math.max(Number(req.body.completionRate || 0), 0), 1);

        const [, updated] = await prisma.$transaction([
            prisma.view.create({
                data: {
                    video_id: video.id,
                    user_id: req.user?.id || null,
                    device_id: req.body.deviceId || req.headers['x-device-id'] || null,
                    watch_time_seconds: Math.round(watchTime),
                    completion_rate: completionRate,
                    ip_hash: getClientHash(req)
                }
            }),
            prisma.video.update({
                where: { id: video.id },
                data: {
                    views: { increment: 1 },
                    watch_time: { increment: BigInt(Math.round(watchTime)) }
                }
            }),
            prisma.analytics.upsert({
                where: { video_id_metric_date: { video_id: video.id, metric_date: toDateBucket() } },
                create: {
                    video_id: video.id,
                    metric_date: toDateBucket(),
                    views: 1,
                    watch_time: Math.round(watchTime)
                },
                update: {
                    views: { increment: 1 },
                    watch_time: { increment: Math.round(watchTime) }
                }
            }),
            prisma.user.update({
                where: { id: video.owner_id },
                data: { total_views: { increment: BigInt(1) } }
            })
        ]);

        res.json({ views: updated.views.toString(), watch_time: updated.watch_time.toString() });
    } catch (error) {
        console.error('[Videos] view error:', error);
        res.status(500).json({ error: 'Failed to record view' });
    }
};

exports.reactToVideo = async (req, res) => {
    try {
        const { reaction } = req.body;
        if (!['like', 'dislike', null, undefined].includes(reaction)) {
            return res.status(400).json({ error: 'reaction must be like, dislike, or null' });
        }

        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!canAccessVideo(video, req.user.id)) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const existing = await prisma.videoLike.findUnique({
            where: { user_id_video_id: { user_id: req.user.id, video_id: video.id } }
        });

        let likeDelta = 0;
        let dislikeDelta = 0;
        let currentReaction = reaction || null;

        if (!reaction) {
            if (existing) {
                likeDelta = existing.reaction === 'like' ? -1 : 0;
                dislikeDelta = existing.reaction === 'dislike' ? -1 : 0;
                await prisma.videoLike.delete({ where: { id: existing.id } });
            }
        } else if (existing) {
            if (existing.reaction !== reaction) {
                likeDelta = reaction === 'like' ? 1 : -1;
                dislikeDelta = reaction === 'dislike' ? 1 : -1;
                await prisma.videoLike.update({ where: { id: existing.id }, data: { reaction } });
            }
        } else {
            likeDelta = reaction === 'like' ? 1 : 0;
            dislikeDelta = reaction === 'dislike' ? 1 : 0;
            await prisma.videoLike.create({
                data: { user_id: req.user.id, video_id: video.id, reaction }
            });
        }

        const updated = await prisma.video.update({
            where: { id: video.id },
            data: {
                likes: { increment: likeDelta },
                dislikes: { increment: dislikeDelta }
            }
        });

        if (likeDelta !== 0) {
            await prisma.user.update({
                where: { id: video.owner_id },
                data: { total_likes: { increment: BigInt(likeDelta) } }
            });
        }

        res.json({
            reaction: currentReaction,
            likes: updated.likes,
            dislikes: updated.dislikes
        });
    } catch (error) {
        console.error('[Videos] reaction error:', error);
        res.status(500).json({ error: 'Failed to update reaction' });
    }
};

exports.listComments = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!canAccessVideo(video, req.user?.id)) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const page = toInt(req.query.page, 1);
        const limit = Math.min(toInt(req.query.limit, 30), 100);
        const skip = (page - 1) * limit;

        const [comments, total] = await Promise.all([
            prisma.comment.findMany({
                where: {
                    video_id: req.params.id,
                    parent_id: null,
                    deleted_at: null,
                    moderation_status: 'visible'
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            display_name: true,
                            unique_handle: true,
                            avatar_url: true,
                            is_verified: true
                        }
                    },
                    replies: {
                        where: { deleted_at: null, moderation_status: 'visible' },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    display_name: true,
                                    unique_handle: true,
                                    avatar_url: true,
                                    is_verified: true
                                }
                            }
                        },
                        orderBy: { created_at: 'asc' },
                        take: 5
                    }
                },
                orderBy: [{ is_pinned: 'desc' }, { created_at: 'desc' }],
                skip,
                take: limit
            }),
            prisma.comment.count({
                where: {
                    video_id: req.params.id,
                    parent_id: null,
                    deleted_at: null,
                    moderation_status: 'visible'
                }
            })
        ]);

        res.json({ page, limit, total, comments });
    } catch (error) {
        console.error('[Videos] comments list error:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
};

exports.createComment = async (req, res) => {
    try {
        const { body, parentId } = req.body;
        if (!body || !String(body).trim()) {
            return res.status(400).json({ error: 'Comment body is required' });
        }

        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!canAccessVideo(video, req.user.id)) {
            return res.status(404).json({ error: 'Video not found' });
        }

        if (parentId) {
            const parent = await prisma.comment.findUnique({ where: { id: parentId } });
            if (!parent || parent.video_id !== video.id || parent.deleted_at) {
                return res.status(400).json({ error: 'Parent comment is invalid' });
            }
        }

        const comment = await prisma.$transaction(async (tx) => {
            const created = await tx.comment.create({
                data: {
                    video_id: video.id,
                    user_id: req.user.id,
                    parent_id: parentId || null,
                    body: String(body).trim()
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            display_name: true,
                            unique_handle: true,
                            avatar_url: true,
                            is_verified: true
                        }
                    }
                }
            });

            await tx.video.update({
                where: { id: video.id },
                data: { comments_count: { increment: 1 } }
            });

            if (video.owner_id !== req.user.id) {
                await tx.notification.create({
                    data: {
                        user_id: video.owner_id,
                        type: 'comment',
                        title: 'New comment on your video',
                        body: created.body,
                        data: { videoId: video.id, commentId: created.id }
                    }
                });
            }

            return created;
        });

        res.status(201).json({ comment });
    } catch (error) {
        console.error('[Videos] comment create error:', error);
        res.status(500).json({ error: 'Failed to create comment' });
    }
};

exports.updateComment = async (req, res) => {
    try {
        const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
        if (!comment || comment.user_id !== req.user.id || comment.deleted_at) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        if (!req.body.body || !String(req.body.body).trim()) {
            return res.status(400).json({ error: 'Comment body is required' });
        }

        const updated = await prisma.comment.update({
            where: { id: comment.id },
            data: {
                body: String(req.body.body).trim(),
                edited_at: new Date()
            }
        });

        res.json({ comment: updated });
    } catch (error) {
        console.error('[Videos] comment update error:', error);
        res.status(500).json({ error: 'Failed to update comment' });
    }
};

exports.deleteComment = async (req, res) => {
    try {
        const comment = await prisma.comment.findUnique({
            where: { id: req.params.commentId },
            include: { video: true }
        });
        if (!comment || comment.deleted_at) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        if (comment.user_id !== req.user.id && comment.video.owner_id !== req.user.id) {
            return res.status(403).json({ error: 'Not allowed to delete this comment' });
        }

        await prisma.$transaction([
            prisma.comment.update({
                where: { id: comment.id },
                data: {
                    deleted_at: new Date(),
                    moderation_status: comment.video.owner_id === req.user.id ? 'removed_by_owner' : 'deleted'
                }
            }),
            prisma.video.update({
                where: { id: comment.video_id },
                data: { comments_count: { decrement: 1 } }
            })
        ]);

        res.json({ message: 'Comment deleted' });
    } catch (error) {
        console.error('[Videos] comment delete error:', error);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
};

exports.pinComment = async (req, res) => {
    try {
        const comment = await prisma.comment.findUnique({
            where: { id: req.params.commentId },
            include: { video: true }
        });
        if (!comment || comment.video.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        const isPinned = Boolean(req.body.isPinned);
        await prisma.$transaction([
            ...(isPinned ? [prisma.comment.updateMany({
                where: { video_id: comment.video_id, is_pinned: true },
                data: { is_pinned: false }
            })] : []),
            prisma.comment.update({ where: { id: comment.id }, data: { is_pinned: isPinned } })
        ]);

        res.json({ pinned: isPinned });
    } catch (error) {
        console.error('[Videos] pin comment error:', error);
        res.status(500).json({ error: 'Failed to pin comment' });
    }
};

exports.toggleSubscription = async (req, res) => {
    try {
        const creatorId = req.params.creatorId;
        if (creatorId === req.user.id) {
            return res.status(400).json({ error: 'You cannot subscribe to yourself' });
        }

        const creator = await prisma.user.findUnique({ where: { id: creatorId } });
        if (!creator) {
            return res.status(404).json({ error: 'Creator not found' });
        }

        const existing = await prisma.subscription.findUnique({
            where: {
                subscriber_id_subscribed_to_id: {
                    subscriber_id: req.user.id,
                    subscribed_to_id: creatorId
                }
            }
        });

        if (existing) {
            const updated = await prisma.$transaction(async (tx) => {
                await tx.subscription.delete({ where: { id: existing.id } });
                return tx.user.update({
                    where: { id: creatorId },
                    data: { subscriber_count: { decrement: 1 } }
                });
            });
            return res.json({ subscribed: false, subscriber_count: updated.subscriber_count });
        }

        const notificationLevel = ['all', 'personalized', 'none'].includes(req.body.notificationLevel)
            ? req.body.notificationLevel
            : 'personalized';

        const updated = await prisma.$transaction(async (tx) => {
            await tx.subscription.create({
                data: {
                    subscriber_id: req.user.id,
                    subscribed_to_id: creatorId,
                    notification_level: notificationLevel
                }
            });
            return tx.user.update({
                where: { id: creatorId },
                data: { subscriber_count: { increment: 1 } }
            });
        });

        res.json({ subscribed: true, subscriber_count: updated.subscriber_count, notification_level: notificationLevel });
    } catch (error) {
        console.error('[Videos] subscription error:', error);
        res.status(500).json({ error: 'Failed to update subscription' });
    }
};

exports.getSubscriptionStatus = async (req, res) => {
    try {
        const subscription = await prisma.subscription.findUnique({
            where: {
                subscriber_id_subscribed_to_id: {
                    subscriber_id: req.user.id,
                    subscribed_to_id: req.params.creatorId
                }
            }
        });

        res.json({
            subscribed: !!subscription,
            notification_level: subscription?.notification_level || null
        });
    } catch (error) {
        console.error('[Videos] subscription status error:', error);
        res.status(500).json({ error: 'Failed to fetch subscription status' });
    }
};

exports.listPlaylists = async (req, res) => {
    try {
        const playlists = await prisma.playlist.findMany({
            where: { owner_id: req.user.id },
            include: {
                videos: {
                    include: {
                        video: {
                            include: {
                                owner: {
                                    select: {
                                        id: true,
                                        display_name: true,
                                        unique_handle: true,
                                        avatar_url: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { position: 'asc' }
                }
            },
            orderBy: { updated_at: 'desc' }
        });

        res.json({ playlists: playlists.map(serializePlaylist) });
    } catch (error) {
        console.error('[Videos] playlists list error:', error);
        res.status(500).json({ error: 'Failed to fetch playlists' });
    }
};

exports.createPlaylist = async (req, res) => {
    try {
        if (!req.body.title || !String(req.body.title).trim()) {
            return res.status(400).json({ error: 'Playlist title is required' });
        }

        const playlist = await prisma.playlist.create({
            data: {
                owner_id: req.user.id,
                title: String(req.body.title).trim(),
                description: req.body.description || null,
                visibility: req.body.visibility || 'private',
                kind: req.body.kind || 'custom',
                is_collaborative: Boolean(req.body.isCollaborative)
            }
        });

        res.status(201).json({ playlist });
    } catch (error) {
        console.error('[Videos] playlist create error:', error);
        res.status(500).json({ error: 'Failed to create playlist' });
    }
};

exports.updatePlaylist = async (req, res) => {
    try {
        const playlist = await prisma.playlist.findUnique({ where: { id: req.params.playlistId } });
        if (!playlist || playlist.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const updated = await prisma.playlist.update({
            where: { id: playlist.id },
            data: {
                ...(req.body.title !== undefined ? { title: String(req.body.title).trim() } : {}),
                ...(req.body.description !== undefined ? { description: req.body.description || null } : {}),
                ...(req.body.visibility !== undefined ? { visibility: req.body.visibility } : {}),
                ...(req.body.isCollaborative !== undefined ? { is_collaborative: Boolean(req.body.isCollaborative) } : {})
            }
        });

        res.json({ playlist: updated });
    } catch (error) {
        console.error('[Videos] playlist update error:', error);
        res.status(500).json({ error: 'Failed to update playlist' });
    }
};

exports.deletePlaylist = async (req, res) => {
    try {
        const playlist = await prisma.playlist.findUnique({ where: { id: req.params.playlistId } });
        if (!playlist || playlist.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        await prisma.playlist.delete({ where: { id: playlist.id } });
        res.json({ message: 'Playlist deleted' });
    } catch (error) {
        console.error('[Videos] playlist delete error:', error);
        res.status(500).json({ error: 'Failed to delete playlist' });
    }
};

exports.addVideoToPlaylist = async (req, res) => {
    try {
        const playlist = await prisma.playlist.findUnique({
            where: { id: req.params.playlistId },
            include: { videos: true }
        });
        if (!playlist || playlist.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const video = await prisma.video.findUnique({ where: { id: req.body.videoId } });
        if (!canAccessVideo(video, req.user.id)) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const position = Number.isInteger(Number(req.body.position))
            ? Number(req.body.position)
            : playlist.videos.length;

        const row = await prisma.playlistVideo.upsert({
            where: {
                playlist_id_video_id: {
                    playlist_id: playlist.id,
                    video_id: video.id
                }
            },
            create: {
                playlist_id: playlist.id,
                video_id: video.id,
                position
            },
            update: { position }
        });

        res.status(201).json({ playlistVideo: row });
    } catch (error) {
        console.error('[Videos] add playlist video error:', error);
        res.status(500).json({ error: 'Failed to add video to playlist' });
    }
};

exports.removeVideoFromPlaylist = async (req, res) => {
    try {
        const playlist = await prisma.playlist.findUnique({ where: { id: req.params.playlistId } });
        if (!playlist || playlist.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        await prisma.playlistVideo.delete({
            where: {
                playlist_id_video_id: {
                    playlist_id: playlist.id,
                    video_id: req.params.videoId
                }
            }
        });

        res.json({ message: 'Video removed from playlist' });
    } catch (error) {
        console.error('[Videos] remove playlist video error:', error);
        res.status(500).json({ error: 'Failed to remove video from playlist' });
    }
};

exports.updateHistory = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!canAccessVideo(video, req.user.id)) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const history = await prisma.history.upsert({
            where: {
                user_id_video_id: {
                    user_id: req.user.id,
                    video_id: video.id
                }
            },
            create: {
                user_id: req.user.id,
                video_id: video.id,
                position_seconds: Math.max(Number(req.body.positionSeconds || 0), 0),
                completed: Boolean(req.body.completed)
            },
            update: {
                position_seconds: Math.max(Number(req.body.positionSeconds || 0), 0),
                completed: Boolean(req.body.completed)
            }
        });

        res.json({ history });
    } catch (error) {
        console.error('[Videos] history update error:', error);
        res.status(500).json({ error: 'Failed to update watch history' });
    }
};

exports.listHistory = async (req, res) => {
    try {
        const rows = await prisma.history.findMany({
            where: { user_id: req.user.id },
            include: {
                video: {
                    include: {
                        owner: {
                            select: {
                                id: true,
                                display_name: true,
                                unique_handle: true,
                                avatar_url: true
                            }
                        }
                    }
                }
            },
            orderBy: { updated_at: 'desc' },
            take: Math.min(toInt(req.query.limit, 50), 100)
        });

        res.json({
            history: rows.map((row) => ({
                ...row,
                video: serializeVideo(row.video)
            }))
        });
    } catch (error) {
        console.error('[Videos] history list error:', error);
        res.status(500).json({ error: 'Failed to fetch watch history' });
    }
};

exports.reportVideo = async (req, res) => {
    try {
        if (!req.body.reason || !String(req.body.reason).trim()) {
            return res.status(400).json({ error: 'Reason is required' });
        }

        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!canAccessVideo(video, req.user.id)) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const report = await prisma.report.create({
            data: {
                reporter_id: req.user.id,
                video_id: video.id,
                reason: String(req.body.reason).trim(),
                details: req.body.details || null
            }
        });

        res.status(201).json({ report });
    } catch (error) {
        console.error('[Videos] report error:', error);
        res.status(500).json({ error: 'Failed to report video' });
    }
};

exports.getCreatorAnalytics = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!video || video.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const [daily, totals] = await Promise.all([
            prisma.analytics.findMany({
                where: { video_id: video.id },
                orderBy: { metric_date: 'desc' },
                take: 30
            }),
            prisma.view.aggregate({
                where: { video_id: video.id },
                _avg: { completion_rate: true },
                _sum: { watch_time_seconds: true },
                _count: { id: true }
            })
        ]);

        res.json({
            video: serializeVideo(video),
            daily,
            totals: {
                views: totals._count.id,
                watchTimeSeconds: totals._sum.watch_time_seconds || 0,
                averageCompletionRate: totals._avg.completion_rate || 0
            }
        });
    } catch (error) {
        console.error('[Videos] analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
};

exports.uploadThumbnail = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({
            where: { id: req.params.id },
            include: { liveSession: true }
        });
        if (!video || video.owner_id !== req.user.id) {
            if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (e) {}
            return res.status(404).json({ error: 'Video not found' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Thumbnail image file is required' });
        }

        // Build thumbnail URL
        const hostUrl = `${req.protocol}://${req.get('host')}`;
        const thumbnailUrl = `${hostUrl}/uploads/${path.basename(req.file.path)}`;

        // Update Video thumbnail
        const updated = await prisma.video.update({
            where: { id: video.id },
            data: { thumbnail: thumbnailUrl }
        });

        // Also update linked LiveSession thumbnail_url if exists
        if (video.live_session_id) {
            await prisma.liveSession.update({
                where: { id: video.live_session_id },
                data: { thumbnail_url: thumbnailUrl }
            }).catch(() => {});
        }

        // Create Thumbnail record
        await prisma.thumbnail.create({
            data: {
                video_id: video.id,
                url: thumbnailUrl,
                kind: 'thumbnail'
            }
        }).catch(() => {});

        res.json({
            message: 'Thumbnail updated',
            video: serializeVideo(updated),
            thumbnailUrl
        });
    } catch (error) {
        if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (e) {}
        console.error('[Videos] thumbnail upload error:', error);
        res.status(500).json({ error: 'Failed to upload thumbnail' });
    }
};

exports.listSubtitles = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const subtitles = await prisma.subtitle.findMany({
            where: { video_id: video.id },
            orderBy: { created_at: 'asc' }
        });

        res.json({ subtitles });
    } catch (error) {
        console.error('[Videos] list subtitles error:', error);
        res.status(500).json({ error: 'Failed to fetch subtitles' });
    }
};

exports.uploadSubtitle = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!video || video.owner_id !== req.user.id) {
            if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (e) {}
            return res.status(404).json({ error: 'Video not found' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Subtitle file is required (VTT or SRT)' });
        }

        const { language, label } = req.body;
        if (!language || !label) {
            if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (e) {}
            return res.status(400).json({ error: 'language and label are required' });
        }

        const hostUrl = `${req.protocol}://${req.get('host')}`;
        const vttUrl = `${hostUrl}/uploads/${path.basename(req.file.path)}`;

        const subtitle = await prisma.subtitle.create({
            data: {
                video_id: video.id,
                language: language.trim(),
                label: label.trim(),
                vtt_url: vttUrl
            }
        });

        res.status(201).json({ message: 'Subtitle added', subtitle });
    } catch (error) {
        if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (e) {}
        console.error('[Videos] subtitle upload error:', error);
        res.status(500).json({ error: 'Failed to upload subtitle' });
    }
};

exports.deleteSubtitle = async (req, res) => {
    try {
        const video = await prisma.video.findUnique({ where: { id: req.params.id } });
        if (!video || video.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const subtitle = await prisma.subtitle.findUnique({ where: { id: req.params.subtitleId } });
        if (!subtitle || subtitle.video_id !== video.id) {
            return res.status(404).json({ error: 'Subtitle not found' });
        }

        await prisma.subtitle.delete({ where: { id: subtitle.id } });
        res.json({ message: 'Subtitle deleted' });
    } catch (error) {
        console.error('[Videos] delete subtitle error:', error);
        res.status(500).json({ error: 'Failed to delete subtitle' });
    }
};
