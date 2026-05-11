import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import net from "net";
import { StreamChat } from "stream-chat";
import User from "../models/user";
import Group from "../models/Groups";
import { getDefaultAvatarUrl } from "../utils/avatar";

const router = express.Router();
const linkPreviewCache = new Map<string, LinkPreview>();

interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image?: string;
  domain: string;
}

const LINK_PREVIEW_TIMEOUT_MS = 5000;
const MAX_PREVIEW_HTML_BYTES = 500000;

const getStreamCredentials = () => {
  const apiKey = process.env.STREAM_API_KEY?.trim();
  const apiSecret = process.env.STREAM_API_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    throw new Error("Stream Chat credentials are not configured.");
  }

  return { apiKey, apiSecret };
};

const decodeAuthHeader = (authHeader?: string) => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: No token provided");
  }

  const token = authHeader.split(" ")[1];
  return jwt.verify(token, process.env.JWT_SECRET as string) as {
    id: string;
    name: string;
  };
};

const isPrivateHostname = (hostname: string) => {
  const lowerHostname = hostname.toLowerCase();
  if (lowerHostname === "localhost" || lowerHostname.endsWith(".local")) {
    return true;
  }

  const ipVersion = net.isIP(lowerHostname);
  if (ipVersion === 4) {
    const parts = lowerHostname.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0
    );
  }

  if (ipVersion === 6) {
    return (
      lowerHostname === "::1" ||
      lowerHostname.startsWith("fc") ||
      lowerHostname.startsWith("fd") ||
      lowerHostname.startsWith("fe80")
    );
  }

  return false;
};

const sanitizePreviewUrl = (rawUrl: unknown) => {
  if (typeof rawUrl !== "string" || rawUrl.length > 2048) {
    return null;
  }

  try {
    const parsedUrl = new URL(rawUrl.trim());
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return null;
    }

    if (!parsedUrl.hostname || isPrivateHostname(parsedUrl.hostname)) {
      return null;
    }

    parsedUrl.hash = "";
    return parsedUrl.toString();
  } catch {
    return null;
  }
};

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const getMetaContent = (html: string, key: string) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedKey}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }

  return "";
};

const getTitle = (html: string) => {
  const ogTitle = getMetaContent(html, "og:title");
  if (ogTitle) return ogTitle;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]) : "";
};

const buildAbsoluteUrl = (value: string, baseUrl: string) => {
  if (!value) return undefined;

  try {
    const parsed = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const fetchLinkPreview = async (url: string): Promise<LinkPreview> => {
  const cachedPreview = linkPreviewCache.get(url);
  if (cachedPreview) return cachedPreview;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MovieTrackerBot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      throw new Error("Preview target did not return HTML");
    }

    const html = (await response.text()).slice(0, MAX_PREVIEW_HTML_BYTES);
    const finalUrl = sanitizePreviewUrl(response.url) || url;
    const domain = new URL(finalUrl).hostname.replace(/^www\./, "");
    const title = getTitle(html) || domain;
    const description =
      getMetaContent(html, "og:description") ||
      getMetaContent(html, "description");
    const image = buildAbsoluteUrl(getMetaContent(html, "og:image"), finalUrl);

    const preview = {
      url: finalUrl,
      title: title.slice(0, 180),
      description: description.slice(0, 260),
      image,
      domain,
    };

    linkPreviewCache.set(url, preview);
    return preview;
  } finally {
    clearTimeout(timeout);
  }
};

router.post("/token", async (req: Request, res: Response) => {
  try {
    const decoded = decodeAuthHeader(req.headers.authorization);

    const userId = decoded.id;
    const userName = decoded.name;

    const { groupId } = req.body;
    if (!groupId) {
      res.status(400).json({ msg: "Group ID is required." });
      return;
    }

    const group = await Group.findById(groupId);
    if (!group) {
      res.status(404).json({ msg: "Group not found." });
      return;
    }

    const groupMembers = await User.find({ _id: { $in: group.members } })
      .select("_id name email avatar")
      .lean();

    const { apiKey, apiSecret } = getStreamCredentials();
    const chatClient = StreamChat.getInstance(apiKey, apiSecret);

    const chatToken = chatClient.createToken(userId);
    await chatClient.upsertUser({ id: userId, name: userName });

    // Upsert all group members so Stream Chat knows about them before channel creation
    await chatClient.upsertUsers(
      groupMembers.map((m) => ({
        id: (m._id as any).toString(),
        name: m.name || m.email || "Unknown user",
        image: m.avatar || getDefaultAvatarUrl(m.name, m.email),
      }))
    );

    res.json({
      token: chatToken,
      apiKey,
      userId,
      name: userName,
      groupMembers,
    });
  } catch (error) {
    console.error("Error in /api/chat/token:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

router.get("/link-preview", async (req: Request, res: Response) => {
  try {
    decodeAuthHeader(req.headers.authorization);

    const sanitizedUrl = sanitizePreviewUrl(req.query.url);
    if (!sanitizedUrl) {
      res.status(400).json({ msg: "Only public http/https URLs are supported." });
      return;
    }

    const preview = await fetchLinkPreview(sanitizedUrl);
    res.json(preview);
  } catch (error) {
    console.error("Error in /api/chat/link-preview:", error);
    res.status(502).json({ msg: "Unable to fetch link preview." });
  }
});

// GET /api/chat/unread-info — lightweight token for navbar unread counts
router.get("/unread-info", async (req: Request, res: Response) => {
  try {
    const decoded = decodeAuthHeader(req.headers.authorization);

    const { apiKey, apiSecret } = getStreamCredentials();
    const chatClient = StreamChat.getInstance(apiKey, apiSecret);

    const chatToken = chatClient.createToken(decoded.id);
    await chatClient.upsertUser({ id: decoded.id, name: decoded.name });

    res.json({
      chatToken,
      apiKey,
      userId: decoded.id,
      name: decoded.name,
    });
  } catch (error) {
    console.error("Error in /api/chat/unread-info:", error);
    res.status(500).json({ msg: "Server error", error: (error as Error).message });
  }
});

export default router;
