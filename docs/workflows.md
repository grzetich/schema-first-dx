# Common Workflows

Integration patterns for the most frequent Buffer API use cases. Each workflow includes the GraphQL operations and the logic connecting them.

## Content Calendar: Schedule a Week of Posts

A typical small business workflow: prepare and schedule content for the coming week across multiple channels.

**Step 1: Get your profiles and their schedules**

```graphql
query {
  profiles {
    id
    channel
    username
    timezone
    schedules {
      days
      times
    }
  }
}
```

This tells you which channels are connected and when their auto-publish time slots are. A profile with `days: ["monday", "wednesday", "friday"]` and `times: ["09:00", "12:30"]` has six publishing slots per week.

**Step 2: Create posts for each slot**

Use `createPosts` to batch-create the week's content. Match each post's `scheduledAt` to a time slot from the profile's schedule:

```graphql
mutation {
  createPosts(input: {
    posts: [
      {
        profileId: "prof_ig_123"
        text: "Monday motivation: small steps lead to big results. 🌱 #smallbusiness"
        scheduledAt: "2025-04-07T09:00:00Z"
        tagIds: ["tag_motivation"]
      }
      {
        profileId: "prof_ig_123"
        text: "Behind the scenes of how we make our products ✨ #behindthescenes"
        scheduledAt: "2025-04-09T09:00:00Z"
        tagIds: ["tag_bts"]
      }
    ]
  }) {
    success
    results {
      success
      post { id status scheduledAt }
      error
    }
  }
}
```

**Step 3: Verify the queue**

Confirm everything is scheduled correctly:

```graphql
query {
  posts(
    status: QUEUED
    scheduledAfter: "2025-04-07"
    scheduledBefore: "2025-04-13"
    sortBy: SCHEDULED_AT_ASC
  ) {
    edges {
      node {
        text
        scheduledAt
        profile { channel username }
        tags { name }
      }
    }
    totalCount
  }
}
```

## Analytics Dashboard: Weekly Performance Report

Pull aggregate metrics and per-post performance to understand what's working.

**Step 1: Profile-level metrics**

```graphql
query {
  profiles {
    id
    channel
    username
    analytics(period: WEEK) {
      followers
      followersChange
      postCount
      impressions
      totalEngagement
      engagementRate
      dailyBreakdown {
        date
        impressions
        engagement
      }
    }
  }
}
```

**Step 2: Top-performing posts**

Find your best content from the past week, sorted by engagement:

```graphql
query {
  posts(
    status: SENT
    scheduledAfter: "2025-03-31"
    scheduledBefore: "2025-04-07"
    sortBy: ENGAGEMENT_DESC
    limit: 10
  ) {
    edges {
      node {
        text
        profile { channel username }
        analytics {
          impressions
          likes
          comments
          shares
          clicks
        }
      }
    }
  }
}
```

**What to do with the data:** Compare engagement rates across channels to see where your audience is most active. Look at which tags (campaigns) drive the most engagement. Use the daily breakdown to spot patterns in timing.

## Cross-Channel Publishing with Platform Optimization

The same message lands differently on each platform. This pattern shows how to tailor content for each channel while maintaining a consistent campaign.

```graphql
mutation {
  createPosts(input: {
    posts: [
      {
        profileId: "prof_ig_123"
        text: "We just launched something new! 🎉 Tap the link in bio to try it free. #newlaunch #smallbiz"
        scheduledAt: "2025-04-01T14:00:00Z"
        tagIds: ["tag_launch"]
      }
      {
        profileId: "prof_x_456"
        text: "Just shipped 🚀 Try it free → buffer.com/new"
        scheduledAt: "2025-04-01T14:00:00Z"
        tagIds: ["tag_launch"]
      }
      {
        profileId: "prof_li_789"
        text: "I'm excited to share that we've launched a new tool designed to help small businesses manage their social media more effectively.\n\nAfter months of research and feedback from our community, we built something that addresses the three biggest pain points we heard:\n\n→ Scheduling across platforms is tedious\n→ Analytics are scattered and hard to compare\n→ Writing for different audiences takes too long\n\nTry it free at buffer.com/new"
        scheduledAt: "2025-04-01T14:00:00Z"
        tagIds: ["tag_launch"]
      }
      {
        profileId: "prof_bs_101"
        text: "We just launched something new for small businesses. Try it free at buffer.com/new 🎉"
        scheduledAt: "2025-04-01T14:00:00Z"
        tagIds: ["tag_launch"]
      }
    ]
  }) {
    success
    results {
      success
      post {
        id
        profile { channel }
        status
      }
      error
    }
  }
}
```

Notice the differences: Instagram uses hashtags and a call to action for bio link. X is short and punchy with a direct URL. LinkedIn is long-form and professional. Bluesky is casual and concise. All four share the same scheduled time and campaign tag for unified analytics.

## Automated RSS-to-Buffer Pipeline

A common integration pattern: monitor a blog RSS feed and auto-create draft posts when new content is published.

**The logic (in your integration code):**

1. Poll your RSS feed for new entries
2. For each new entry, generate platform-appropriate text
3. Create drafts via the API
4. A human reviews and approves the drafts in Buffer's UI

**Step 3 in GraphQL:**

```graphql
mutation {
  createPosts(input: {
    posts: [
      {
        profileId: "prof_x_456"
        text: "New on the blog: How to Build a Content Calendar That Actually Works → myblog.com/content-calendar"
      }
      {
        profileId: "prof_li_789"
        text: "I just published a guide on building a content calendar that works for small businesses.\n\nIt covers the three biggest mistakes I see and how to avoid them.\n\nRead it here: myblog.com/content-calendar"
      }
    ]
  }) {
    success
    results {
      success
      post { id status }
      error
    }
  }
}
```

By omitting `scheduledAt`, both posts are created as `DRAFT`. The business owner reviews them in Buffer, makes any edits, and clicks publish or adds them to the queue when ready. This keeps a human in the loop while automating the tedious part.

## Campaign Performance: Compare Tags

Tags let you group posts by campaign and compare performance across channels.

```graphql
query {
  posts(tagId: "tag_launch", status: SENT) {
    edges {
      node {
        profile { channel }
        analytics {
          impressions
          likes
          comments
          shares
        }
      }
    }
    totalCount
  }
}
```

Run this for each tag (campaign) you want to compare. Aggregate the analytics in your application to answer questions like: "Did our product launch get more engagement on LinkedIn or Instagram?" and "Which campaign drove the most clicks this quarter?"
