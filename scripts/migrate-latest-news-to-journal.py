import html
import json
import pathlib
import re
import subprocess
import tempfile
import urllib.request


STORE = "seppeltsfield"
BLOG_ID = "gid://shopify/Blog/101553995928"
CREATE_MUTATION_FILE = r"C:\workspace\dev-store\seppeltsfield\scripts\create-journal-article.graphql"
QUERY_BLOG_FILE = r"C:\workspace\dev-store\seppeltsfield\scripts\query-journal-articles.graphql"

POSTS_TO_MIGRATE = [
    ("seppeltsfield-joins-the-porsche-global-destination-charging-network", "Estate News"),
    ("corporate-functions-brochure", "Estate News"),
    ("seppeltsfield-travels-back-in-time-to-honour-its-175th-anniversary", "Estate News"),
    ("legendary-bladesmith-barry-gardener-opens-the-tiny-knife-shop-at-seppeltsfield", "Estate News"),
    ("celebrate-this-christmas-with-seppeltsfield-wines-and-lark-distillery-whisky", "Estate News"),
    ("australias-fino-revival", "Media"),
    ("seppeltsfield-celebrates-partnership-with-tasting-australia-2026", "Estate News"),
    ("base-your-ceramics-practice-in-south-australias-beautiful-barossa-valley", "Estate News"),
    ("become-part-of-our-inner-circle-and-join-the-crown-society", "Estate News"),
    ("red-hot-summer-tour-is-turning-up-the-heat", "Estate News"),
    ("seppeltsfield-shines-on-sunrise-on-7", "Estate News"),
    ("nick-ryan-review-seppeltsfield-1925-100-year-old-para-vintage-tawny", "Media"),
    ("1925-100-year-old-para-vintage-tawny", "Estate News"),
]


def run_shopify(args):
    command = ["shopify.cmd", "store", "execute", "--store", STORE, "--json"] + args
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout)
    stdout = result.stdout
    json_start = stdout.find("{")
    if json_start == -1:
        raise RuntimeError(f"No JSON payload returned:\n{stdout}")
    return json.loads(stdout[json_start:])


def fetch_json(url):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def strip_html(text):
    no_tags = re.sub(r"<[^>]+>", "", text or "")
    return html.unescape(no_tags).strip()


def get_existing_handles():
    payload = run_shopify(["--query-file", QUERY_BLOG_FILE])
    for blog in payload.get("blogs", {}).get("nodes", []):
        if blog.get("handle") == "journal":
            return {article["handle"] for article in blog.get("articles", {}).get("nodes", [])}
    return set()


def build_article_input(post, tag):
    title = html.unescape(post["title"]["rendered"]).strip()
    body = post["content"]["rendered"]
    summary = post.get("excerpt", {}).get("rendered", "")
    author = "Seppeltsfield Team"
    if "_embedded" in post and "author" in post["_embedded"] and post["_embedded"]["author"]:
        author = post["_embedded"]["author"][0].get("name") or author

    image = None
    featured = post.get("_embedded", {}).get("wp:featuredmedia", [])
    if featured:
        url = featured[0].get("source_url")
        if url:
            image = {
                "url": url,
                "altText": strip_html(featured[0].get("alt_text") or title),
            }

    publish_date = post.get("date_gmt")
    if publish_date:
        publish_date = f"{publish_date}Z"

    article_input = {
        "blogId": BLOG_ID,
        "title": title,
        "handle": post["slug"],
        "body": body,
        "summary": summary,
        "isPublished": True,
        "tags": [tag],
        "author": {"name": author},
    }
    if publish_date:
        article_input["publishDate"] = publish_date
    if image:
        article_input["image"] = image
    return article_input


def main():
    existing_handles = get_existing_handles()
    created = []
    skipped = []

    for slug, tag in POSTS_TO_MIGRATE:
        if slug in existing_handles:
            skipped.append(slug)
            continue

        url = f"https://seppeltsfield.com.au/wp-json/wp/v2/posts?slug={slug}&_embed=1"
        posts = fetch_json(url)
        if not posts:
            raise RuntimeError(f"WordPress post not found for slug: {slug}")
        post = posts[0]
        article_input = build_article_input(post, tag)
        variables = {"article": article_input}

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as temp_file:
            temp_path = pathlib.Path(temp_file.name)
            json.dump(variables, temp_file, ensure_ascii=False)

        try:
            response = run_shopify(
                [
                    "--query-file",
                    CREATE_MUTATION_FILE,
                    "--variable-file",
                    str(temp_path),
                    "--allow-mutations",
                ]
            )
        finally:
            temp_path.unlink(missing_ok=True)

        result = response.get("articleCreate", {})
        errors = result.get("userErrors", [])
        if errors:
            raise RuntimeError(f"Failed for {slug}: {errors}")
        created_article = result.get("article", {})
        created.append((created_article.get("title"), created_article.get("handle")))

    print(f"Created {len(created)} articles.")
    for title, handle in created:
        print(f"  - {title} ({handle})")
    if skipped:
        print(f"Skipped {len(skipped)} existing articles.")
        for slug in skipped:
            print(f"  - {slug}")


if __name__ == "__main__":
    main()
