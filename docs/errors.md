# Error Reference

Every GraphQL mutation returns `success` and `error` fields. Every HTTP response includes a status code. This page documents both, grouped by what you were trying to do when things went wrong.

## How Errors Work in GraphQL

Unlike REST APIs that rely entirely on HTTP status codes, GraphQL APIs return `200 OK` for most responses, even when the operation fails at the application level. You'll encounter two kinds of errors:

**GraphQL-level errors** appear in a top-level `errors` array. These mean your query itself is malformed, like referencing a field that doesn't exist or missing a required variable.

**Application-level errors** appear in the mutation's `error` field. These mean your query was valid but the operation couldn't be completed, like trying to post text that exceeds a channel's character limit.

Always check both.

```javascript
const result = await response.json();

// Check for GraphQL-level errors first
if (result.errors) {
  console.error("Query error:", result.errors[0].message);
  return;
}

// Then check the mutation result
if (!result.data.createPost.success) {
  console.error("Operation failed:", result.data.createPost.error);
  return;
}

// Success
console.log("Post created:", result.data.createPost.post.id);
```

---

## Authentication Errors

These come back as HTTP status codes, not GraphQL responses.

### 401 — Missing or Invalid Token

**When it happens:** Your `Authorization` header is missing, malformed, or the token has been revoked.

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "invalid_token",
  "message": "The access token provided is expired, revoked, or malformed."
}
```

**What to do:**
- Verify your header format is `Authorization: Bearer YOUR_TOKEN` (note the space after "Bearer")
- Check that the token hasn't been revoked in your Buffer app settings
- If using OAuth, the user may have disconnected your app. Prompt them to reauthorize.

### 403 — Insufficient Scope

**When it happens:** Your token is valid but doesn't have permission for this operation. For example, a read-only token trying to create a post.

```
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "insufficient_scope",
  "message": "This action requires the 'write' scope. Your token has: ['read']."
}
```

**What to do:** Request a new token with the appropriate scopes during the OAuth flow.

---

## Rate Limiting

### 429 — Too Many Requests

**When it happens:** You've exceeded the request limit for your current rate window.

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2025-04-01T14:35:00Z
Retry-After: 47
Content-Type: application/json

{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Try again in 47 seconds."
}
```

**What to do:**
- Read the `Retry-After` header and wait that many seconds before retrying
- Better yet, read `X-RateLimit-Remaining` on every response and slow down before you hit zero
- For batch operations, query `rateLimit` first to check your budget
- Consider using webhooks instead of polling to reduce unnecessary requests

**Proactive rate limit check:**

```graphql
query {
  rateLimit {
    limit
    remaining
    resetsAt
    windowSeconds
  }
}
```

---

## Creating Posts

### Text Exceeds Character Limit

**When it happens:** The post text is longer than the target channel allows.

```json
{
  "data": {
    "createPost": {
      "success": false,
      "post": null,
      "error": "Text exceeds maximum length for X (280 characters). Your text is 314 characters."
    }
  }
}
```

**What to do:** Shorten the text or post to a different channel. Character limits by channel: X: 280, Bluesky: 300, Threads: 500, Instagram: 2,200, LinkedIn: 3,000.

**Tip:** Validate text length client-side before making the API call. The channel limits are documented in the schema's `Channel` enum descriptions, so you can query them programmatically:

```graphql
query {
  __type(name: "Channel") {
    enumValues {
      name
      description
    }
  }
}
```

### Duplicate Content

**When it happens:** You're trying to post the same text to the same profile that was posted recently.

```json
{
  "data": {
    "createPost": {
      "success": false,
      "post": null,
      "error": "This content was recently posted to this profile. Duplicate posts within 24 hours are not allowed."
    }
  }
}
```

**What to do:** Modify the text or wait 24 hours. This restriction exists because social media platforms penalize accounts that post duplicate content, so Buffer prevents it at the API level to protect your accounts.

### Profile Disconnected

**When it happens:** The social media profile has been disconnected (e.g., the user revoked access on the platform side, or the platform token expired).

```json
{
  "data": {
    "createPost": {
      "success": false,
      "post": null,
      "error": "Profile prof_abc123 is disconnected. The user must reauthorize this profile in Buffer."
    }
  }
}
```

**What to do:**
- Check `profile.isConnected` before attempting to post
- Direct the user to reconnect the profile in the Buffer UI
- Subscribe to the `PROFILE_CONNECTION_CHANGED` webhook to detect disconnections in real time instead of discovering them at post time

### Scheduling in the Past

**When it happens:** The `scheduledAt` timestamp is in the past.

```json
{
  "data": {
    "createPost": {
      "success": false,
      "post": null,
      "error": "Cannot schedule posts in the past. The scheduledAt time (2025-03-01T10:00:00Z) has already passed."
    }
  }
}
```

**What to do:** Use a future timestamp, or omit `scheduledAt` to create a draft instead. All timestamps must be ISO 8601 in UTC.

### Profile Queue Limit Reached

**When it happens:** The profile's queue is full. Buffer limits how many posts can be queued per profile depending on the user's plan.

```json
{
  "data": {
    "createPost": {
      "success": false,
      "post": null,
      "error": "Queue limit reached for this profile (2,000 posts). Remove or publish existing queued posts before adding more."
    }
  }
}
```

**What to do:** Publish, delete, or move some queued posts to drafts to free up space.

---

## Updating Posts

### Post Not Found

**When it happens:** The post ID doesn't exist or belongs to a different user.

```json
{
  "data": {
    "updatePost": {
      "success": false,
      "post": null,
      "error": "Post post_xyz789 not found."
    }
  }
}
```

**What to do:** Verify the post ID. Post IDs are scoped to the authenticated user, so you can't access another user's posts.

### Cannot Edit Sent Posts

**When it happens:** You're trying to update a post that has already been published.

```json
{
  "data": {
    "updatePost": {
      "success": false,
      "post": null,
      "error": "Cannot edit a post that has already been sent. Only DRAFT and QUEUED posts can be updated."
    }
  }
}
```

**What to do:** Once a post is `SENT`, it lives on the social media platform. You'd need to delete and recreate it, or edit it directly on the platform.

---

## Media Upload

### Unsupported File Type

```json
{
  "data": {
    "uploadMedia": {
      "success": false,
      "media": null,
      "error": "Unsupported file type: .bmp. Supported image formats: JPEG, PNG, GIF, WebP. Supported video formats: MP4, MOV."
    }
  }
}
```

### File Too Large

```json
{
  "data": {
    "uploadMedia": {
      "success": false,
      "media": null,
      "error": "File size (15.2 MB) exceeds the maximum for images (10 MB). For videos, the limit is 512 MB."
    }
  }
}
```

---

## Webhooks

### Invalid URL

```json
{
  "data": {
    "createWebhook": {
      "success": false,
      "webhook": null,
      "error": "Webhook URL must use HTTPS. Provided: http://myapp.com/webhooks"
    }
  }
}
```

### URL Not Reachable

```json
{
  "data": {
    "createWebhook": {
      "success": false,
      "webhook": null,
      "error": "Could not reach the webhook URL. Buffer sends a verification request on creation. Ensure your endpoint is publicly accessible and returns a 200 status."
    }
  }
}
```

---

## GraphQL Query Errors

These appear in a top-level `errors` array, not in the mutation result.

### Missing Required Variable

```json
{
  "errors": [
    {
      "message": "Variable '$input' expected value of type 'CreatePostInput!' but got: { text: \"hello\" }. Field 'profileId' of required type 'ID!' was not provided.",
      "locations": [{ "line": 2, "column": 15 }]
    }
  ]
}
```

**What to do:** The error tells you exactly which field is missing. Add the required field.

### Unknown Field

```json
{
  "errors": [
    {
      "message": "Cannot query field 'followers' on type 'Profile'. Did you mean 'followerCount'?",
      "locations": [{ "line": 4, "column": 5 }]
    }
  ]
}
```

**What to do:** GraphQL gives you typo suggestions. Use schema introspection to explore available fields:

```graphql
query {
  __type(name: "Profile") {
    fields {
      name
      description
    }
  }
}
```

---

## Debugging Checklist

When something isn't working:

1. **Check the HTTP status code.** 401/403 = auth problem. 429 = rate limit. 200 = check the response body.
2. **Check `errors` array.** If present, your query is malformed. Read the message carefully, GraphQL errors are specific.
3. **Check `success` and `error` fields.** If `success` is false, the `error` string tells you why.
4. **Check `X-RateLimit-Remaining` header.** If it's 0, you're rate limited even if you haven't gotten a 429 yet.
5. **Check `profile.isConnected`.** Many post creation failures trace back to a disconnected profile.
6. **Use introspection.** If you're unsure about field names, types, or required parameters, query the schema directly. That's what it's there for.
