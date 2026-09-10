import os

base = r'C:\Users\LENOVO\Desktop\veakay-handoff\backend-repo\src'

def read(p):
    with open(os.path.join(base, p), 'r') as f:
        return f.read()

def write(p, c):
    with open(os.path.join(base, p), 'w') as f:
        f.write(c)

like_body = ' + actorName + " liked your post"
like_log = "Failed to create like notification for post " + postId + ": " + (err as Error).message

repost_body = ' + actorName + " shared your post"
repost_log = "Failed to create share notification for post " + postId + ": " + (err as Error).message

comment_body = ' + actorName + " commented on your post"
comment_log = "Failed to create comment notification for post " + postId + ": " + (err as Error).message

friend_body = ' + requesterName + " sent you a friend request"
friend_log = "Failed to create friend request notification: " + (err as Error).message

# 1. posts.service.ts
c = read('modules/feed/posts.service.ts')

c = c.replace(
    'import { Injectable } from "@nestjs/common";',
    'import { Injectable, Logger } from "@nestjs/common";'
)

c = c.replace(
    "import { MediaAssetsService } from '../storage/media-assets.service';",
    "import { MediaAssetsService } from '../storage/media-assets.service';\nimport { NotificationsService } from '../notifications/services/notifications.service';"
)

c = c.replace(
    'constructor(\n     private readonly prisma: PrismaService,\n     private readonly friendsService: FriendsService,\n     private readonly mediaAssetsService: MediaAssetsService,\n   ) {}',
    'constructor(\n     private readonly prisma: PrismaService,\n     private readonly friendsService: FriendsService,\n     private readonly mediaAssetsService: MediaAssetsService,\n     private readonly notificationsService: NotificationsService,\n   ) {}'
)

c = c.replace(
    '  async like(postId: string, userId: string) {\n    await this.findByIdOrThrow(postId);\n    const existing = await this.prisma.postLike.findUnique({\n      where: { postId_userId: { postId, userId } },\n    });\n    if (existing) {\n      throw AppException.conflict("You already liked this post.");\n    }\n    await this.prisma.postLike.create({ data: { postId, userId } });\n  }',
    '  async like(postId: string, userId: string) {\n    const post = await this.findByIdOrThrow(postId);\n    const existing = await this.prisma.postLike.findUnique({\n      where: { postId_userId: { postId, userId } },\n    });\n    if (existing) {\n      throw AppException.conflict("You already liked this post.");\n    }\n    await this.prisma.postLike.create({ data: { postId, userId } });\n\n    if (post.authorId !== userId) {\n      try {\n        const actor = await this.prisma.user.findUnique({\n          where: { id: userId },\n          select: { username: true, displayName: true },\n        });\n        const actorName = actor && (actor.displayName || actor.username) ? (actor.displayName || actor.username) : "Someone";\n        await this.notificationsService.create(post.authorId, {\n          type: "like",\n          title: "New like",\n          body: ` + like_body + ',\n          deepLinkTarget: "post",\n          deepLinkEntityId: postId,\n        });\n      } catch (err) {\n        this.logger.error(\n          ` + like_log + ',\n        );\n      }\n    }\n  }'
)

c = c.replace(
    '  async repost(postId: string, authorId: string, caption?: string) {\n    await this.findByIdOrThrow(postId);\n    return this.prisma.post.create({\n      data: {\n        authorId,\n        text: caption ?? "",\n        repostOfId: postId,\n      },\n    });\n  }',
    '  async repost(postId: string, authorId: string, caption?: string) {\n    const originalPost = await this.findByIdOrThrow(postId);\n    const repost = await this.prisma.post.create({\n      data: {\n        authorId,\n        text: caption ?? "",\n        repostOfId: postId,\n      },\n    });\n\n    if (originalPost.authorId !== authorId) {\n      try {\n        const actor = await this.prisma.user.findUnique({\n          where: { id: authorId },\n          select: { username: true, displayName: true },\n        });\n        const actorName = actor && (actor.displayName || actor.username) ? (actor.displayName || actor.username) : "Someone";\n        await this.notificationsService.create(originalPost.authorId, {\n          type: "share",\n          title: "New share",\n          body: ` + repost_body + ',\n          deepLinkTarget: "post",\n          deepLinkEntityId: postId,\n        });\n      } catch (err) {\n        this.logger.error(\n          ` + repost_log + ',\n        );\n      }\n    }\n\n    return repost;\n  }'
)

write('modules/feed/posts.service.ts', c)
print('posts.service.ts updated')

# 2. comments.service.ts
c = read('modules/feed/comments.service.ts')

c = c.replace(
    'import { Injectable } from "@nestjs/common";',
    'import { Injectable, Logger } from "@nestjs/common";'
)

c = c.replace(
    "import { PostsService } from './posts.service';",
    "import { PostsService } from './posts.service';\nimport { NotificationsService } from '../notifications/services/notifications.service';"
)

c = c.replace(
    'constructor(\n     private readonly prisma: PrismaService,\n     private readonly postsService: PostsService,\n   ) {}',
    'constructor(\n     private readonly prisma: PrismaService,\n     private readonly postsService: PostsService,\n     private readonly notificationsService: NotificationsService,\n   ) {}'
)

c = c.replace(
    '  async create(postId: string, authorId: string, dto: CreateCommentDto) {\n    await this.postsService.findByIdOrThrow(postId);\n    return this.prisma.comment.create({\n      data: { postId, authorId, text: dto.text },\n    });\n  }',
    '  async create(postId: string, authorId: string, dto: CreateCommentDto) {\n    const post = await this.postsService.findByIdOrThrow(postId);\n    const comment = await this.prisma.comment.create({\n      data: { postId, authorId, text: dto.text },\n    });\n\n    if (post.authorId !== authorId) {\n      try {\n        const actor = await this.prisma.user.findUnique({\n          where: { id: authorId },\n          select: { username: true, displayName: true },\n        });\n        const actorName = actor && (actor.displayName || actor.username) ? (actor.displayName || actor.username) : "Someone";\n        await this.notificationsService.create(post.authorId, {\n          type: "comment",\n          title: "New comment",\n          body: ` + comment_body + ',\n          deepLinkTarget: "post",\n          deepLinkEntityId: postId,\n        });\n      } catch (err) {\n        this.logger.error(\n          ` + comment_log + ',\n        );\n      }\n    }\n\n    return comment;\n  }'
)

write('modules/feed/comments.service.ts', c)
print('comments.service.ts updated')

# 3. friends.service.ts
c = read('modules/friends/friends.service.ts')

c = c.replace(
    'import { Injectable } from "@nestjs/common";',
    'import { Injectable, Logger } from "@nestjs/common";'
)

c = c.replace(
    "import { PrismaService } from '../prisma/prisma.service';",
    "import { PrismaService } from '../prisma/prisma.service';\nimport { NotificationsService } from '../notifications/services/notifications.service';"
)

c = c.replace(
    'constructor(private readonly prisma: PrismaService) {}',
    'constructor(\n     private readonly prisma: PrismaService,\n     private readonly notificationsService: NotificationsService,\n   ) {}'
)

c = c.replace(
    '  async sendRequest(requesterId: string, addresseeId: string) {\n    if (requesterId === addresseeId) {\n      throw AppException.badRequest(\n        "You cannot send a friend request to yourself.",\n      );\n    }\n\n    const addressee = await this.prisma.user.findUnique({\n      where: { id: addresseeId },\n    });\n    if (!addressee) {\n      throw AppException.notFound("User not found.");\n    }\n\n    const existing = await this.prisma.friendRequest.findFirst({\n      where: {\n        OR: [\n          { requesterId, addresseeId },\n          { requesterId: addresseeId, addresseeId: requesterId },\n        ],\n        status: {\n          in: [FriendRequestStatus.pending, FriendRequestStatus.accepted],\n        },\n      },\n    });\n    if (existing) {\n      throw AppException.conflict(\n        existing.status === FriendRequestStatus.accepted\n          ? "You are already friends with this user."\n          : "A friend request already exists between you and this user.",\n      );\n    }\n\n    return this.prisma.friendRequest.create({\n      data: { requesterId, addresseeId },\n    });\n  }',
    '  async sendRequest(requesterId: string, addresseeId: string) {\n    if (requesterId === addresseeId) {\n      throw AppException.badRequest(\n        "You cannot send a friend request to yourself.",\n      );\n    }\n\n    const addressee = await this.prisma.user.findUnique({\n      where: { id: addresseeId },\n    });\n    if (!addressee) {\n      throw AppException.notFound("User not found.");\n    }\n\n    const existing = await this.prisma.friendRequest.findFirst({\n      where: {\n        OR: [\n          { requesterId, addresseeId },\n          { requesterId: addresseeId, addresseeId: requesterId },\n        ],\n        status: {\n          in: [FriendRequestStatus.pending, FriendRequestStatus.accepted],\n        },\n      },\n    });\n    if (existing) {\n      throw AppException.conflict(\n        existing.status === FriendRequestStatus.accepted\n          ? "You are already friends with this user."\n          : "A friend request already exists between you and this user.",\n      );\n    }\n\n    const requester = await this.prisma.user.findUnique({\n      where: { id: requesterId },\n      select: { username: true, displayName: true },\n    });\n    const requesterName = requester && (requester.displayName || requester.username) ? (requester.displayName || requester.username) : "Someone";\n\n    const result = await this.prisma.friendRequest.create({\n      data: { requesterId, addresseeId },\n    });\n\n    try {\n      await this.notificationsService.create(addresseeId, {\n        type: "friend_request",\n        title: "Friend request",\n        body: ` + friend_body + ',\n        deepLinkTarget: "friends",\n        deepLinkEntityId: requesterId,\n      });\n    } catch (err) {\n      this.logger.error(\n        ` + friend_log + ',\n      );\n    }\n\n    return result;\n  }'
)

write('modules/friends/friends.service.ts', c)
print('friends.service.ts updated')

# 4. feed.module.ts
c = read('modules/feed/feed.module.ts')

c = c.replace(
    "import { FriendsModule } from '../friends/friends.module';\nimport { StorageModule } from '../storage/storage.module';",
    "import { FriendsModule } from '../friends/friends.module';\nimport { StorageModule } from '../storage/storage.module';\nimport { NotificationsModule } from '../notifications/notifications.module';"
)

c = c.replace(
    'imports: [FriendsModule, StorageModule],',
    'imports: [FriendsModule, StorageModule, NotificationsModule],'
)

write('modules/feed/feed.module.ts', c)
print('feed.module.ts updated')

# 5. friends.module.ts
c = read('modules/friends/friends.module.ts')

c = c.replace(
    "import { FriendsController } from './friends.controller';\nimport { FriendsService } from './friends.service';",
    "import { FriendsController } from './friends.controller';\nimport { FriendsService } from './friends.service';\nimport { NotificationsModule } from '../notifications/notifications.module';"
)

c = c.replace(
    '@Module({\n  controllers: [FriendsController],',
    '@Module({\n  imports: [NotificationsModule],\n  controllers: [FriendsController],'
)

write('modules/friends/friends.module.ts', c)
print('friends.module.ts updated')
print('All patches applied successfully')
