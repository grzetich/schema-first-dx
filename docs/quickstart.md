# Quickstart: Buffer GraphQL API

Get from zero to your first API call in under five minutes.

## Prerequisites

- A Buffer account with at least one connected social media profile
- An API access token (get one at [buffer.com/developer-api](https://buffer.com/developer-api))

## Your First Query: List Your Profiles

Every interaction with the Buffer API starts with knowing which profiles (connected social accounts) you have. This query returns all of them:

```graphql
query {
  profiles {
    id
    channel
    name
    username
    isConnected
  }
}
```

### JavaScript (fetch)

```javascript
const response = await fetch("https://api.buffer.com/graphql", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_ACCESS_TOKEN",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: `{ profiles { id channel name username isConnected } }`,
  }),
});

const { data } = await response.json();
console.log(data.profiles);
// [{ id: "prof_abc123", channel: "INSTAGRAM", name: "My Business", ... }]
```

### Python (requests)

```python
import requests

response = requests.post(
    "https://api.buffer.com/graphql",
    headers={"Authorization": "Bearer YOUR_ACCESS_TOKEN"},
    json={"query": "{ profiles { id channel name username isConnected } }"},
)

profiles = response.json()["data"]["profiles"]
for p in profiles:
    print(f"{p['channel']}: @{p['username']} (connected: {p['isConnected']})")
```

### curl

```bash
curl -X POST https://api.buffer.com/graphql \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ profiles { id channel name username isConnected } }"}'
```

### Response

```json
{
  "data": {
    "profiles": [
      {
        "id": "prof_abc123",
        "channel": "INSTAGRAM",
        "name": "My Business",
        "username": "mybusiness",
        "isConnected": true
      },
      {
        "id": "prof_def456",
        "channel": "LINKEDIN",
        "name": "Jane Smith",
        "username": "janesmith",
        "isConnected": true
      }
    ]
  }
}
```

> **Why start here?** You'll need a profile `id` for almost every other API call. Think of profiles as the "accounts" you're posting to. One profile = one social media account on one platform.

## Create and Schedule a Post

Here's where it gets interesting. To create a post, you need two things: a profile ID (from the previous step) and the text you want to post. Add `scheduledAt` to schedule it, or omit it to save as a draft.

### Schedule a post (JavaScript)

```javascript
const response = await fetch("https://api.buffer.com/graphql", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_ACCESS_TOKEN",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: `
      mutation($input: CreatePostInput!) {
        createPost(input: $input) {
          success
          post { id status scheduledAt }
          error
        }
      }
    `,
    variables: {
      input: {
        profileId: "prof_abc123",
        text: "Excited to share what we've been working on! 🚀",
        scheduledAt: "2025-04-01T14:30:00Z",
      },
    },
  }),
});

const { data } = await response.json();

if (data.createPost.success) {
  console.log(`Scheduled! Post ID: ${data.createPost.post.id}`);
} else {
  console.error(`Failed: ${data.createPost.error}`);
}
```

### Save as draft (omit scheduledAt)

```javascript
const variables = {
  input: {
    profileId: "prof_abc123",
    text: "Excited to share what we've been working on! 🚀",
    // No scheduledAt = saved as DRAFT
  },
};
```

> **Draft vs. Queued:** If you include `scheduledAt`, the post is created as `QUEUED` and will be published automatically at that time. If you omit it, the post is created as `DRAFT` and won't be published until someone explicitly schedules or publishes it.

## What Happens When Something Goes Wrong

Every mutation returns `success` (boolean) and `error` (string). **Always check both.** Here are common error scenarios and what to do about them:

### Text too long for the channel

```javascript
// Trying to post 300+ characters to X (limit: 280)
const { data } = await response.json();
// {
//   "createPost": {
//     "success": false,
//     "post": null,
//     "error": "Text exceeds maximum length for X (280 characters). Your text is 314 characters."
//   }
// }
```

**Fix:** Check the character limit before posting. Each channel's limit is documented in the schema's `Channel` enum. X: 280, Bluesky: 300, Threads: 500, Instagram: 2200, LinkedIn: 3000.

### Profile is disconnected

```javascript
// {
//   "createPost": {
//     "success": false,
//     "post": null,
//     "error": "Profile prof_abc123 is disconnected. The user needs to reauthorize this profile in Buffer."
//   }
// }
```

**Fix:** Check `profile.isConnected` before attempting to post. If a profile is disconnected, the user needs to reauthorize it in the Buffer UI. You can subscribe to the `PROFILE_CONNECTION_CHANGED` webhook to get notified when this happens.

### Rate limited

```javascript
// HTTP 429 response
// Headers:
//   X-RateLimit-Limit: 300
//   X-RateLimit-Remaining: 0
//   X-RateLimit-Reset: 2025-04-01T14:31:00Z
```

**Fix:** Read the `X-RateLimit-Remaining` header on every response and throttle your requests before you hit zero. Or query `rateLimit` before batch operations to check your budget. The `X-RateLimit-Reset` header tells you when you can resume.

### GraphQL validation error

```javascript
// {
//   "errors": [
//     {
//       "message": "Variable '$input' expected value of type 'CreatePostInput!' but got: { text: \"hello\" }. Field 'profileId' of required type 'ID!' was not provided.",
//       "locations": [{ "line": 2, "column": 15 }]
//     }
//   ]
// }
```

**Fix:** This is a schema validation error, meaning your query structure is wrong. The error message tells you exactly which field is missing. In this case, `profileId` is required but wasn't included.

## Post to Multiple Channels at Once

Most users want to publish across several platforms simultaneously. Use `createPosts` (plural) and customize the text for each platform:

```javascript
const response = await fetch("https://api.buffer.com/graphql", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_ACCESS_TOKEN",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: `
      mutation($input: CreatePostsInput!) {
        createPosts(input: $input) {
          success
          results {
            success
            post { id profile { channel username } status }
            error
          }
        }
      }
    `,
    variables: {
      input: {
        posts: [
          {
            profileId: "prof_ig_123",
            text: "New feature alert! 🎉 Link in bio. #buffer #socialmedia",
            scheduledAt: "2025-04-01T14:30:00Z",
          },
          {
            profileId: "prof_li_456",
            text: "I'm thrilled to announce we've launched a new feature that helps small businesses manage their social media more effectively.",
            scheduledAt: "2025-04-01T14:30:00Z",
          },
          {
            profileId: "prof_x_789",
            text: "New feature just dropped 🚀 Try it free →",
            scheduledAt: "2025-04-01T14:30:00Z",
          },
        ],
      },
    },
  }),
});

const { data } = await response.json();

// Each post is created independently. Some may succeed while others fail.
for (const result of data.createPosts.results) {
  if (result.success) {
    console.log(`✓ ${result.post.profile.channel}: ${result.post.id}`);
  } else {
    console.error(`✗ Failed: ${result.error}`);
  }
}
```

> **Why customize per channel?** Instagram uses hashtags and calls to action for bio links. LinkedIn is longer and more professional. X is short and punchy. Each platform has a different audience expectation and character limit. Posting the exact same text everywhere is a missed opportunity.

## Set Up Webhooks (Stop Polling)

Instead of repeatedly checking whether your posts have been published, register a webhook and let Buffer notify you:

```javascript
const response = await fetch("https://api.buffer.com/graphql", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_ACCESS_TOKEN",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: `
      mutation($input: CreateWebhookInput!) {
        createWebhook(input: $input) {
          success
          webhook { id secret events }
          error
        }
      }
    `,
    variables: {
      input: {
        url: "https://myapp.com/webhooks/buffer",
        events: ["POST_SENT", "POST_FAILED", "COMMENT_RECEIVED"],
      },
    },
  }),
});

const { data } = await response.json();
// Save the webhook.secret to verify incoming payloads
// using the X-Buffer-Signature header
```

> **Why webhooks matter:** The old Buffer API required polling (repeatedly asking "is it done yet?") with a 60 request/minute limit. If you had 50 queued posts, checking their status ate your entire rate limit budget. Webhooks push events to you in real time, so you never waste a request asking for status updates.

## Check Post Performance

After a post is published (`SENT` status), you can pull its analytics:

```python
import requests

query = """
query($postId: ID!) {
  post(id: $postId) {
    text
    sentAt
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
"""

response = requests.post(
    "https://api.buffer.com/graphql",
    headers={"Authorization": "Bearer YOUR_ACCESS_TOKEN"},
    json={"query": query, "variables": {"postId": "post_xyz789"}},
)

post = response.json()["data"]["post"]
stats = post["analytics"]
print(f"@{post['profile']['username']} ({post['profile']['channel']})")
print(f"  Impressions: {stats['impressions']:,}")
print(f"  Engagement: {stats['likes'] + stats['comments'] + stats['shares']:,}")
print(f"  Clicks: {stats['clicks']:,}")
```

> **Note:** Analytics are only available for posts with status `SENT`. Querying analytics on a draft or queued post returns `null`, not an error.

## Next Steps

- Read the [Error Reference](./errors.md) for every error you might encounter, with response bodies and fixes
- Read [Common Workflows](./workflows.md) for patterns like content calendars, analytics dashboards, and automated RSS-to-Buffer pipelines
- See [AI-Native Design](./ai-design.md) to understand how the API is designed for AI agent consumption
- Browse the full [schema](../schema/schema.graphql) for all available types, queries, and mutations
