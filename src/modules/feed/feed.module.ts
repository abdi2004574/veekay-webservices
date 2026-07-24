import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { UserPostsController } from './user-posts.controller';

@Module({
  imports: [FriendsModule],
  controllers: [
    PostsController,
    CommentsController,
    StoriesController,
    UserPostsController,
  ],
  providers: [PostsService, CommentsService, StoriesService],
  exports: [PostsService, CommentsService, StoriesService],
})
export class FeedModule {}
