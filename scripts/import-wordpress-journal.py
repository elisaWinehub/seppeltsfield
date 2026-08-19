"""Import the WordPress WXR export into the Shopify Journal blog.

Usage:
  python scripts/import-wordpress-journal.py
  python scripts/import-wordpress-journal.py --xml "C:\\path\\to\\export.xml"
"""

from __future__ import annotations

import argparse
import html
import json
import mimetypes
import pathlib
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from html.parser import HTMLParser


STORE = "seppeltsfield"
BLOG_ID = "gid://shopify/Blog/101553995928"
SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent
DEFAULT_XML = pathlib.Path(
    r"c:\Users\ElisaDelaCruz\Downloads\seppeltsfieldbarossa.WordPress.2026-08-19.xml"
)
CACHE_PATH = SCRIPTS_DIR / ".journal-wp-import-cache.json"
SKIPPED_IMAGE = "__skipped__"

NS = {
    "wp": "http://wordpress.org/export/1.2/",
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc": "http://purl.org/dc/elements/1.1/",
}

PERSONAL_AUTHORS = {
    "leah f": "Leah Falland",
    "leah falland": "Leah Falland",
}
AGENCY_AUTHORS = {
    "gmillard@hcwd.com.au",
    "hcombadm",
    "marhd",
    "gmillard@honeycomb.design",
    "mark millard",
    "giedre millard",
}

MEDIA_TITLE_HINTS = (
    "nick ryan",
    "weekend australian",
    "sunrise on 7",
    "fino revival",
    "is this the best place in australia",
    "feature by",
    "quotes seppeltsfield",
    "review",
)
WINEMAKER_TITLE_HINTS = (
    "vintage report",
    "vintage recap",
    "chief winemaker",
    "winemaking team",
    "new winemaker",
    "tale of two barossa vintages",
    "hat-trick",
)

IMG_URL_RE = re.compile(
    r"https?://(?:www\.)?seppeltsfield\.com\.au/wp-content/uploads/[^\"'\s<>]+",
    re.IGNORECASE,
)
YOUTUBE_RE = re.compile(
    r"(https?://(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_\-]+)",
    re.IGNORECASE,
)
SIZE_SUFFIX_RE = re.compile(r"-\d+x\d+(?=\.(?:jpe?g|png|gif|webp)$)", re.IGNORECASE)


class SrcExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.urls: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag != "img":
            return
        attr = dict(attrs)
        for key in ("src", "data-src"):
            if attr.get(key):
                self.urls.append(attr[key])
        if attr.get("srcset"):
            for part in attr["srcset"].split(","):
                url = part.strip().split(" ")[0]
                if url:
                    self.urls.append(url)


def run_shopify(args: list[str], retries: int = 5) -> dict:
    command = ["shopify.cmd", "store", "execute", "--store", STORE, "--json"] + args
    last_error = ""
    for attempt in range(retries):
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        stdout = result.stdout or ""
        stderr = result.stderr or ""
        if result.returncode != 0:
            last_error = stderr or stdout
            if "Throttl" in last_error or "429" in last_error:
                time.sleep(2 + attempt * 2)
                continue
            raise RuntimeError(last_error)
        json_start = stdout.find("{")
        if json_start == -1:
            last_error = stdout or stderr or "Shopify CLI returned no JSON"
            time.sleep(2 + attempt * 2)
            continue
        return json.loads(stdout[json_start:])
    raise RuntimeError(last_error or "Shopify CLI returned no JSON")


def execute_query(query_file: str, variables: dict | None = None, allow_mutations: bool = False) -> dict:
    args = ["--query-file", str(SCRIPTS_DIR / query_file)]
    temp_path = None
    if variables is not None:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as temp_file:
            temp_path = pathlib.Path(temp_file.name)
            json.dump(variables, temp_file, ensure_ascii=False)
        args.extend(["--variable-file", str(temp_path)])
    if allow_mutations:
        args.append("--allow-mutations")
    try:
        return run_shopify(args)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {"images": {}}


def save_cache(cache: dict) -> None:
    CACHE_PATH.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


def normalize_title(value: str) -> str:
    text = html.unescape(value or "")
    text = text.replace("\xa0", " ").replace("&amp;", "&")
    text = re.sub(r"\s+", " ", text).strip().lower()
    text = re.sub(r"[^a-z0-9& ]+", "", text)
    return text


def title_case_if_needed(value: str) -> str:
    text = html.unescape(value or "").replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    letters = [ch for ch in text if ch.isalpha()]
    if letters and all(ch.isupper() for ch in letters) and len(letters) > 8:
        return text.title().replace("'S", "'s").replace(" And ", " and ").replace(" Of ", " of ")
    return text


def normalize_author(creator: str, display_names: dict[str, str]) -> str:
    raw = (creator or "").strip()
    key = raw.lower()
    if key in PERSONAL_AUTHORS:
        return PERSONAL_AUTHORS[key]
    if key in AGENCY_AUTHORS or "@" in raw:
        return "Team Seppeltsfield"
    display = display_names.get(key)
    if display:
        if display.lower() in AGENCY_AUTHORS or "@" in display:
            return "Team Seppeltsfield"
        return display
    return "Team Seppeltsfield"


def classify_tag(title: str, body: str, categories: list[str]) -> str:
    cats = [c.lower() for c in categories]
    if any("recipe" in c for c in cats):
        return "Recipes"
    title_l = title.lower()
    if any(hint in title_l for hint in MEDIA_TITLE_HINTS):
        return "Media"
    if "barrel of laughs" not in title_l and any(hint in title_l for hint in WINEMAKER_TITLE_HINTS):
        return "Winemaker Notes"
    blob = f"{title} {strip_html(body)}".lower()
    if "nick ryan" in blob or "weekend australian" in blob:
        return "Media"
    if re.search(r"\bvintage (report|recap)\b", blob) or "chief winemaker" in blob:
        return "Winemaker Notes"
    return "Estate News"


def strip_html(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", text or "")).strip()


def parse_xml(path: pathlib.Path) -> tuple[list[dict], list[tuple[str, str]], dict[str, str]]:
    tree = ET.parse(path)
    channel = tree.getroot().find("channel")
    if channel is None:
        raise RuntimeError("Invalid WXR: missing channel")

    display_names: dict[str, str] = {}
    for author in channel.findall("wp:author", NS):
        login = (author.findtext("wp:author_login", default="", namespaces=NS) or "").strip()
        display = (author.findtext("wp:author_display_name", default="", namespaces=NS) or "").strip()
        if login:
            display_names[login.lower()] = display

    attachments: dict[str, str] = {}
    skipped: list[tuple[str, str]] = []
    posts: list[dict] = []
    items = channel.findall("item")

    for item in items:
        post_type = item.findtext("wp:post_type", default="", namespaces=NS) or ""
        if post_type != "attachment":
            continue
        post_id = item.findtext("wp:post_id", default="", namespaces=NS) or ""
        url = item.findtext("wp:attachment_url", default="", namespaces=NS) or ""
        if post_id and url:
            attachments[post_id] = url

    for item in items:
        post_type = item.findtext("wp:post_type", default="", namespaces=NS) or ""
        status = item.findtext("wp:status", default="", namespaces=NS) or ""
        post_id = item.findtext("wp:post_id", default="", namespaces=NS) or ""
        title = (item.findtext("title") or "").strip()
        if post_type == "attachment":
            continue
        if post_type != "post":
            continue
        if status != "publish":
            skipped.append((status, title))
            continue

        body = item.findtext("content:encoded", default="", namespaces=NS) or ""
        creator = item.findtext("dc:creator", default="", namespaces=NS) or ""
        categories = [
            (cat.text or "").strip()
            for cat in item.findall("category")
            if cat.get("domain") == "category" and cat.text
        ]
        thumbnail_id = ""
        for meta in item.findall("wp:postmeta", NS):
            key = meta.findtext("wp:meta_key", default="", namespaces=NS) or ""
            if key == "_thumbnail_id":
                thumbnail_id = meta.findtext("wp:meta_value", default="", namespaces=NS) or ""
        posts.append(
            {
                "id": post_id,
                "title": title,
                "handle": item.findtext("wp:post_name", default="", namespaces=NS) or "",
                "date": item.findtext("wp:post_date_gmt", default="", namespaces=NS)
                or item.findtext("wp:post_date", default="", namespaces=NS)
                or "",
                "body": body,
                "creator": creator,
                "categories": categories,
                "thumbnail_id": thumbnail_id,
                "featured_url": attachments.get(thumbnail_id, ""),
            }
        )

    for post in posts:
        post["author"] = normalize_author(post["creator"], display_names)
        post["tag"] = classify_tag(post["title"], post["body"], post["categories"])
        post["clean_title"] = title_case_if_needed(post["title"])

    return posts, skipped, attachments


def collect_image_urls(posts: list[dict]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    def add(url: str) -> None:
        url = html.unescape(url or "").strip()
        if not url or url in seen:
            return
        if "wp-content/uploads" not in url.lower():
            return
        seen.add(url)
        found.append(url)

    for post in posts:
        add(post.get("featured_url", ""))
        for match in IMG_URL_RE.findall(post.get("body") or ""):
            add(match)
        parser = SrcExtractor()
        try:
            parser.feed(post.get("body") or "")
        except Exception:
            pass
        for url in parser.urls:
            add(url)
    return found


def download_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; SeppeltsfieldJournalImport/1.0)"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def wait_for_file(file_id: str) -> str | None:
    for attempt in range(15):
        payload = execute_query("file-status.graphql", {"id": file_id})
        node = payload.get("node") or {}
        status = node.get("fileStatus")
        url = None
        if node.get("image"):
            url = node["image"].get("url")
        elif node.get("url"):
            url = node.get("url")
        if status == "READY" and url:
            return url
        if status == "FAILED":
            return None
        time.sleep(0.6 if attempt < 8 else 1.2)
    return None


def upload_via_url(source_url: str, filename: str, alt: str) -> str | None:
    payload = execute_query(
        "file-create.graphql",
        {
            "files": [
                {
                    "originalSource": source_url,
                    "filename": filename,
                    "contentType": "IMAGE",
                    "alt": alt,
                }
            ]
        },
        allow_mutations=True,
    )
    result = payload.get("fileCreate") or {}
    errors = result.get("userErrors") or []
    if errors:
        raise RuntimeError(str(errors))
    files = result.get("files") or []
    if not files:
        return None
    file_node = files[0]
    url = None
    if file_node.get("image"):
        url = file_node["image"].get("url")
    elif file_node.get("url"):
        url = file_node.get("url")
    if file_node.get("fileStatus") == "READY" and url:
        return url
    file_id = file_node.get("id")
    if not file_id:
        return None
    return wait_for_file(file_id)


def upload_via_staged(source_url: str, filename: str, alt: str) -> str | None:
    data = download_bytes(source_url)
    mime = mimetypes.guess_type(filename)[0] or "image/jpeg"
    staged = execute_query(
        "staged-uploads-create.graphql",
        {
            "input": [
                {
                    "filename": filename,
                    "mimeType": mime,
                    "httpMethod": "POST",
                    "resource": "FILE",
                }
            ]
        },
        allow_mutations=True,
    )
    targets = (staged.get("stagedUploadsCreate") or {}).get("stagedTargets") or []
    errors = (staged.get("stagedUploadsCreate") or {}).get("userErrors") or []
    if errors:
        raise RuntimeError(str(errors))
    if not targets:
        return None
    target = targets[0]
    boundary = "----JournalImportBoundary"
    parts = []
    for param in target.get("parameters") or []:
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{param['name']}\"\r\n\r\n{param['value']}\r\n"
        )
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n"
    )
    body = b"".join(p.encode("utf-8") for p in parts) + data + f"\r\n--{boundary}--\r\n".encode("utf-8")
    request = urllib.request.Request(
        target["url"],
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        response.read()
    payload = execute_query(
        "file-create.graphql",
        {
            "files": [
                {
                    "originalSource": target["resourceUrl"],
                    "filename": filename,
                    "contentType": "IMAGE",
                    "alt": alt,
                }
            ]
        },
        allow_mutations=True,
    )
    result = payload.get("fileCreate") or {}
    errors = result.get("userErrors") or []
    if errors:
        raise RuntimeError(str(errors))
    files = result.get("files") or []
    if not files:
        return None
    file_node = files[0]
    url = None
    if file_node.get("image"):
        url = file_node["image"].get("url")
    elif file_node.get("url"):
        url = file_node.get("url")
    if file_node.get("fileStatus") == "READY" and url:
        return url
    return wait_for_file(file_node.get("id"))


def filename_from_url(url: str) -> str:
    path = urllib.parse.urlparse(html.unescape(url)).path
    name = pathlib.PurePosixPath(path).name or "journal-image.jpg"
    name = urllib.parse.unquote(name)
    return re.sub(r"[^A-Za-z0-9._-]+", "-", name)


def canonical_image_url(url: str) -> str:
    return SIZE_SUFFIX_RE.sub("", url)


def rehost_images(urls: list[str], cache: dict) -> dict[str, str]:
    mapping: dict[str, str] = dict(cache.get("images") or {})
    groups: dict[str, list[str]] = {}
    for url in urls:
        groups.setdefault(canonical_image_url(url), []).append(url)

    items = list(groups.items())
    total = len(items)
    for index, (canon, originals) in enumerate(items, start=1):
        existing = mapping.get(canon)
        if not existing:
            for original in originals:
                if mapping.get(original):
                    existing = mapping[original]
                    break
        if existing == SKIPPED_IMAGE:
            continue
        if existing:
            mapping[canon] = existing
            for original in originals:
                mapping[original] = existing
            continue

        filename = filename_from_url(canon)
        print(f"[{index}/{total}] Uploading {filename}")
        shopify_url = None
        try:
            shopify_url = upload_via_url(canon, filename, filename)
        except Exception as error:
            print(f"  URL upload failed, trying staged: {error}")
        if not shopify_url:
            try:
                shopify_url = upload_via_staged(canon, filename, filename)
            except Exception as error:
                print(f"  Staged upload failed: {error}")
        if shopify_url:
            mapping[canon] = shopify_url
            for original in originals:
                mapping[original] = shopify_url
            cache["images"] = mapping
            save_cache(cache)
        else:
            print(f"  SKIPPED image: {canon}")
            mapping[canon] = SKIPPED_IMAGE
            cache["images"] = mapping
            save_cache(cache)
    return mapping


def wrap_youtube_iframe(match: re.Match) -> str:
    tag = match.group(0)
    src_match = re.search(r'src=["\']([^"\']+)', tag, re.IGNORECASE)
    if not src_match:
        return tag
    src = src_match.group(1)
    if "youtube.com/embed" not in src and "youtu.be/" in src:
        video_id = src.rsplit("/", 1)[-1]
        src = f"https://www.youtube.com/embed/{video_id}"
    return (
        '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:2rem 0;">'
        f'<iframe src="{src}" title="YouTube video" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" '
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>'
        "</div>"
    )


def wrap_youtube(body: str) -> str:
    return re.sub(
        r"<iframe[^>]+(?:youtube\.com/embed/|youtube\.com/watch|youtu\.be/)[^>]*>\s*</iframe>",
        wrap_youtube_iframe,
        body,
        flags=re.IGNORECASE,
    )


def rewrite_body(body: str, image_map: dict[str, str]) -> str:
    html_body = body or ""
    html_body = html_body.replace("<!--more-->", "")
    html_body = html_body.replace("\xa0", " ")
    for original, hosted in sorted(image_map.items(), key=lambda item: len(item[0]), reverse=True):
        if not hosted or hosted == SKIPPED_IMAGE:
            continue
        html_body = html_body.replace(original, hosted)
        html_body = html_body.replace(html.escape(original), hosted)

    def clean_img(match: re.Match) -> str:
        tag = match.group(0)
        src_match = re.search(r'src=["\']([^"\']+)["\']', tag, re.IGNORECASE)
        alt_match = re.search(r'alt=["\']([^"\']*)["\']', tag, re.IGNORECASE)
        src = src_match.group(1) if src_match else ""
        alt = alt_match.group(1) if alt_match else ""
        if not src:
            return tag
        return f'<img src="{src}" alt="{alt}" loading="lazy">'

    html_body = re.sub(r"<img\b[^>]*>", clean_img, html_body, flags=re.IGNORECASE)
    html_body = re.sub(r"<p>\s*(?:&nbsp;|\s)*</p>", "", html_body, flags=re.IGNORECASE)
    html_body = wrap_youtube(html_body)
    html_body = re.sub(
        r'style="[^"]*font-family:[^"]*"',
        "",
        html_body,
        flags=re.IGNORECASE,
    )
    return html_body.strip()


def publish_date(value: str) -> str | None:
    raw = (value or "").strip()
    if not raw or raw.startswith("0000"):
        return None
    if "T" not in raw:
        raw = raw.replace(" ", "T")
    if not raw.endswith("Z"):
        raw = f"{raw}Z"
    return raw


def fetch_existing_articles() -> list[dict]:
    articles: list[dict] = []
    cursor = None
    while True:
        variables = {"blogId": BLOG_ID, "cursor": cursor}
        payload = execute_query("query-journal-articles-page.graphql", variables)
        blog = payload.get("blog") or {}
        connection = blog.get("articles") or {}
        articles.extend(connection.get("nodes") or [])
        page = connection.get("pageInfo") or {}
        if not page.get("hasNextPage"):
            break
        cursor = page.get("endCursor")
        time.sleep(0.3)
    return articles


def claimed_by_other_post(article: dict, wp_tag: str) -> bool:
    tags = article.get("tags") or []
    other = [tag for tag in tags if str(tag).startswith("wp-id-") and tag != wp_tag]
    return bool(other)


def find_existing(post: dict, existing: list[dict]) -> dict | None:
    wp_tag = f"wp-id-{post['id']}"
    for article in existing:
        tags = article.get("tags") or []
        if wp_tag in tags:
            return article
    wanted = normalize_title(post["clean_title"])
    handle = (post.get("handle") or "").lower()
    for article in existing:
        if claimed_by_other_post(article, wp_tag):
            continue
        if handle and (article.get("handle") or "").lower() == handle:
            return article
        if normalize_title(article.get("title") or "") == wanted:
            return article
    return None


def handle_taken(errors: list[dict]) -> bool:
    blob = " ".join(str(error.get("message") or "") for error in errors).lower()
    return "handle" in blob and ("taken" in blob or "already" in blob)


def article_payload(post: dict, body: str, image_map: dict[str, str], include_blog: bool) -> dict:
    tags = [post["tag"], f"wp-id-{post['id']}"]
    payload = {
        "title": post["clean_title"],
        "body": body,
        "summary": strip_html(body)[:320],
        "isPublished": True,
        "tags": tags,
        "author": {"name": post["author"]},
    }
    if include_blog:
        payload["blogId"] = BLOG_ID
        if post.get("handle"):
            payload["handle"] = post["handle"]
    featured = post.get("featured_url")
    featured_shopify = image_map.get(featured) if featured else None
    if featured_shopify and featured_shopify != SKIPPED_IMAGE:
        payload["image"] = {
            "url": featured_shopify,
            "altText": post["clean_title"],
        }
    date = publish_date(post.get("date") or "")
    if date:
        payload["publishDate"] = date
    return payload


def upsert_article(post: dict, body: str, image_map: dict[str, str], existing: dict | None) -> tuple[str, dict | None]:
    if existing:
        payload = article_payload(post, body, image_map, include_blog=False)
        response = execute_query(
            "update-journal-article.graphql",
            {"id": existing["id"], "article": payload},
            allow_mutations=True,
        )
        result = response.get("articleUpdate") or {}
        errors = result.get("userErrors") or []
        if errors:
            raise RuntimeError(errors)
        return "updated", result.get("article")
    payload = article_payload(post, body, image_map, include_blog=True)
    handles = []
    base_handle = post.get("handle") or ""
    year = (post.get("date") or "")[:4]
    if base_handle:
        handles.append(base_handle)
        if year:
            handles.append(f"{base_handle}-{year}")
        handles.append(f"{base_handle}-{post['id']}")
    last_errors: list = []
    for handle in handles or [None]:
        if handle:
            payload["handle"] = handle
        else:
            payload.pop("handle", None)
        response = execute_query(
            "create-journal-article.graphql",
            {"article": payload},
            allow_mutations=True,
        )
        result = response.get("articleCreate") or {}
        errors = result.get("userErrors") or []
        if not errors:
            return "created", result.get("article")
        last_errors = errors
        if not handle_taken(errors):
            raise RuntimeError(errors)
    raise RuntimeError(last_errors)


def mapped_image_url(url: str, image_map: dict[str, str]) -> str | None:
    if not url:
        return None
    for key in (url, canonical_image_url(url)):
        hosted = image_map.get(key)
        if hosted and hosted != SKIPPED_IMAGE:
            return hosted
    return None


def index_articles_by_wp_id(articles: list[dict]) -> dict[str, dict]:
    indexed: dict[str, dict] = {}
    for article in articles:
        for tag in article.get("tags") or []:
            if str(tag).startswith("wp-id-"):
                indexed[str(tag)] = article
    return indexed


def print_verify_report(posts: list[dict], articles: list[dict], skipped: list[tuple[str, str]]) -> dict:
    by_wp = index_articles_by_wp_id(articles)
    with_image = [article for article in articles if (article.get("image") or {}).get("url")]
    without_image = [article for article in articles if not (article.get("image") or {}).get("url")]
    missing_posts = [post for post in posts if f"wp-id-{post['id']}" not in by_wp]
    expected_no_image = [post for post in posts if not post.get("featured_url")]
    unexpected_no_image = []
    for article in without_image:
        tags = [str(tag) for tag in (article.get("tags") or [])]
        wp_tag = next((tag for tag in tags if tag.startswith("wp-id-")), "")
        post_id = wp_tag.replace("wp-id-", "", 1) if wp_tag else ""
        post = next((item for item in posts if item["id"] == post_id), None)
        if post and post.get("featured_url"):
            unexpected_no_image.append(article)

    print("\n=== LIVE SHOPIFY VERIFY ===")
    print(f"XML published posts: {len(posts)}")
    print(f"XML skipped non-published: {len(skipped)}")
    print(f"XML posts with featured image: {sum(1 for post in posts if post.get('featured_url'))}")
    print(f"XML posts without featured image: {len(expected_no_image)}")
    print(f"Shopify Journal articles: {len(articles)}")
    print(f"Shopify articles with featured image: {len(with_image)}")
    print(f"Shopify articles without featured image: {len(without_image)}")
    print(f"WP posts missing from Shopify: {len(missing_posts)}")
    print(f"Articles missing an image that WordPress had: {len(unexpected_no_image)}")
    for post in expected_no_image:
        print(f"  expected placeholder: {post['clean_title']}")
    for article in unexpected_no_image:
        print(f"  UNEXPECTED missing image: {article.get('title')} ({article.get('handle')})")
    for post in missing_posts:
        print(f"  MISSING article: {post['clean_title']} ({post.get('handle')})")

    print("Duplicate-title pairs (expected if WordPress reused a title):")
    title_counts = Counter(normalize_title(article.get("title") or "") for article in articles)
    for title, count in title_counts.items():
        if count > 1:
            print(f"  {count}x {title}")
            for article in articles:
                if normalize_title(article.get("title") or "") == title:
                    print(
                        f"    {article.get('publishedAt')} {article.get('handle')} {article.get('tags')}"
                    )
    return {
        "articles": len(articles),
        "with_image": len(with_image),
        "without_image": len(without_image),
        "unexpected_missing": len(unexpected_no_image),
        "missing_posts": len(missing_posts),
    }


def set_article_image(article_id: str, image_url: str, alt_text: str) -> dict:
    response = execute_query(
        "update-journal-article.graphql",
        {
            "id": article_id,
            "article": {"image": {"url": image_url, "altText": alt_text}},
        },
        allow_mutations=True,
    )
    result = response.get("articleUpdate") or {}
    errors = result.get("userErrors") or []
    if errors:
        raise RuntimeError(errors)
    return result.get("article") or {}


def backfill_featured_images(posts: list[dict], skipped: list[tuple[str, str]]) -> None:
    cache = load_cache()
    image_map = dict(cache.get("images") or {})
    existing_articles = fetch_existing_articles()
    before = print_verify_report(posts, existing_articles, skipped)
    print("\n=== FEATURED IMAGE BACKFILL ===")
    print(
        f"Before: {before['with_image']}/{before['articles']} articles have a featured image "
        f"({before['without_image']} without)."
    )

    by_wp = index_articles_by_wp_id(existing_articles)
    already_had = []
    no_wp_image = []
    attached = []
    created = []
    failed = []

    for index, post in enumerate(posts, start=1):
        wp_tag = f"wp-id-{post['id']}"
        article = by_wp.get(wp_tag)
        featured_url = post.get("featured_url") or ""
        print(f"[{index}/{len(posts)}] {post['clean_title']}", end="")
        if not article:
            print(" -> missing article, creating")
            try:
                image_map = rehost_images(collect_image_urls([post]), cache)
                body = rewrite_body(post["body"], image_map)
                action, created_article = upsert_article(post, body, image_map, None)
                if created_article:
                    existing_articles.append(created_article)
                    by_wp[wp_tag] = created_article
                created.append(post["clean_title"])
            except Exception as error:
                failed.append((post["clean_title"], str(error)))
                print(f"  FAILED: {error}")
            time.sleep(0.2)
            continue

        if (article.get("image") or {}).get("url"):
            print(" -> already has featured image")
            already_had.append(post["clean_title"])
            continue
        if not featured_url:
            print(" -> no WordPress featured image (placeholder)")
            no_wp_image.append(post["clean_title"])
            continue

        shopify_url = mapped_image_url(featured_url, image_map)
        if not shopify_url:
            print(" -> uploading featured image")
            image_map = rehost_images([featured_url], cache)
            shopify_url = mapped_image_url(featured_url, image_map)
        else:
            print(" -> attaching cached featured image")
        if not shopify_url:
            failed.append((post["clean_title"], f"featured image unavailable: {featured_url}"))
            print(f"  FAILED: featured image unavailable")
            continue
        try:
            updated = set_article_image(article["id"], shopify_url, post["clean_title"])
            if updated:
                article.update(updated)
            attached.append(post["clean_title"])
        except Exception as error:
            failed.append((post["clean_title"], str(error)))
            print(f"  FAILED: {error}")
        time.sleep(0.2)

    after_articles = fetch_existing_articles()
    after = print_verify_report(posts, after_articles, skipped)
    print("\n=== BACKFILL SUMMARY ===")
    print(f"Already had featured image: {len(already_had)}")
    print(f"No WordPress featured image: {len(no_wp_image)}")
    print(f"Attached featured image: {len(attached)}")
    print(f"Created missing articles: {len(created)}")
    print(f"Failed: {len(failed)}")
    print(
        f"After: {after['with_image']}/{after['articles']} articles have a featured image "
        f"({after['without_image']} without)."
    )
    if attached:
        print("Attached titles:")
        for title in attached:
            print(f"  - {title}")
    if created:
        print("Created titles:")
        for title in created:
            print(f"  - {title}")
    if failed:
        print("Failed titles:")
        for title, error in failed:
            print(f"  - {title}: {error}")
    if after["unexpected_missing"]:
        raise SystemExit("Backfill incomplete: WordPress featured images are still missing in Shopify.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xml", default=str(DEFAULT_XML))
    parser.add_argument(
        "--backfill-images",
        action="store_true",
        help="Attach missing featured images on existing Journal articles only.",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Compare the WordPress export against live Shopify Journal data and exit.",
    )
    args = parser.parse_args()
    xml_path = pathlib.Path(args.xml)
    if not xml_path.exists():
        raise SystemExit(f"XML not found: {xml_path}")

    posts, skipped, _attachments = parse_xml(xml_path)
    dflip_posts = [post["clean_title"] for post in posts if "[dflip" in (post["body"] or "").lower()]
    print(f"Parsed {len(posts)} published posts.")
    print("Skipped non-published posts:")
    for status, title in skipped:
        print(f"  - [{status}] {title}")
    print("Flagged [dflip] posts:")
    for title in dflip_posts or ["(none)"]:
        print(f"  - {title}")

    if args.verify:
        articles = fetch_existing_articles()
        report = print_verify_report(posts, articles, skipped)
        if report["unexpected_missing"] or report["missing_posts"] or report["articles"] != len(posts):
            raise SystemExit("Live Shopify Journal does not match the WordPress export.")
        return

    if args.backfill_images:
        backfill_featured_images(posts, skipped)
        return

    cache = load_cache()
    image_urls = collect_image_urls(posts)
    print(f"Found {len(image_urls)} unique WordPress image URLs.")
    image_map = rehost_images(image_urls, cache)

    existing_articles = fetch_existing_articles()
    print(f"Existing Journal articles: {len(existing_articles)}")

    created = []
    updated = []
    failed = []
    for index, post in enumerate(posts, start=1):
        body = rewrite_body(post["body"], image_map)
        match = find_existing(post, existing_articles)
        print(f"[{index}/{len(posts)}] {post['clean_title']} -> {post['tag']} ({'update' if match else 'create'})")
        try:
            action, article = upsert_article(post, body, image_map, match)
            if article:
                if match:
                    match.update(article)
                else:
                    existing_articles.append(article)
            if action == "created":
                created.append(post["clean_title"])
            else:
                updated.append(post["clean_title"])
        except Exception as error:
            failed.append((post["clean_title"], str(error)))
            print(f"  FAILED: {error}")
        time.sleep(0.2)

    print("\n=== IMPORT SUMMARY ===")
    print(f"Created: {len(created)}")
    print(f"Updated: {len(updated)}")
    print(f"Failed: {len(failed)}")
    print(f"Skipped non-published: {len(skipped)}")
    print("Created titles:")
    for title in created:
        print(f"  - {title}")
    print("Updated titles:")
    for title in updated:
        print(f"  - {title}")
    if failed:
        print("Failed titles:")
        for title, error in failed:
            print(f"  - {title}: {error}")
    print("Skipped non-published posts:")
    for status, title in skipped:
        print(f"  - [{status}] {title}")
    print("Flagged [dflip] post:")
    for title in dflip_posts:
        print(f"  - {title}")


if __name__ == "__main__":
    main()
