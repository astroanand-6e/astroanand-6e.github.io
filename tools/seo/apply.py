"""Write the SEO block into every page's <head>: canonical URL, Open Graph and Twitter tags pointing at
the page's preview card (assets/og/<slug>.jpg, tools/og/render.py), and JSON-LD structured data that ties
every page to one Person entity (https://anandthakkar.vercel.app/#person).

Run from the repo root after changing a page's title or description, or adding a page:
    python3 tools/seo/apply.py
Idempotent: the block lives between <!-- seo:start --> and <!-- seo:end --> and is replaced on each run;
older loose og:/twitter:/canonical tags and ld+json blocks in the head are removed. If the site moves to
another domain, change SITE here, in robots.txt, sitemap.xml, llms.txt and tools/og/cards.json.
"""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = 'https://anandthakkar.vercel.app'
PERSON_ID = f'{SITE}/#person'
WEBSITE_ID = f'{SITE}/#website'
PERSON_REF = {'@type': 'Person', '@id': PERSON_ID, 'name': 'Anand Thakkar', 'url': f'{SITE}/'}
SAME_AS = ['https://github.com/astroanand-6e', 'https://huggingface.co/astroanand', 'https://www.linkedin.com/in/anand-thakkar']

PERSON = {
    '@type': 'Person', '@id': PERSON_ID, 'name': 'Anand Thakkar', 'givenName': 'Anand', 'familyName': 'Thakkar',
    'alternateName': 'astroanand', 'url': f'{SITE}/', 'image': f'{SITE}/assets/og/home.jpg', 'jobTitle': 'AI Engineer',
    'description': ('AI engineer in Boston who builds interactive interfaces and multimodal models: audio-language '
                    'models, medical image segmentation and on-device speech recognition. MS in AI at Northeastern University.'),
    'email': 'mailto:anandthakkar041@gmail.com',
    'address': {'@type': 'PostalAddress', 'addressLocality': 'Boston', 'addressRegion': 'MA', 'addressCountry': 'US'},
    'affiliation': {'@type': 'CollegeOrUniversity', 'name': 'Northeastern University', 'url': 'https://www.northeastern.edu/'},
    'alumniOf': {'@type': 'CollegeOrUniversity', 'name': 'SRM Institute of Science and Technology'},
    'knowsAbout': ['Machine learning', 'Multimodal learning', 'Audio-language models', 'Music genre classification',
                   'Medical image segmentation', 'ECG classification', 'On-device speech recognition', 'PyTorch', 'MLX',
                   'WebGL', 'Interactive interfaces'],
    'sameAs': SAME_AS,
}


def code(name, repo, keywords, contributor=False, extra=None):
    work = {'@type': 'SoftwareSourceCode', 'name': name, 'codeRepository': repo, 'keywords': keywords}
    work['contributor' if contributor else 'author'] = PERSON_REF
    return {**work, **(extra or {})}


# file, URL path, card slug, og:type, breadcrumb name, main entity (None = the home profile page)
PAGES = [
    ('index.html', '/', 'home', 'website', None, None),
    ('papers/index.html', '/papers', 'papers', 'article', 'Paper implementations',
     {'@type': 'TechArticle', 'headline': 'Paper implementations', 'author': PERSON_REF,
      'about': ['beta-VAE', 'Variational autoencoders']}),
    ('blog/index.html', '/blog', 'blog', 'website', 'Blog', {'@type': 'Blog', 'name': 'Blog', 'author': PERSON_REF}),
    ('blog/posts/local-llm-roundup-2026-11.html', '/blog/posts/local-llm-roundup-2026-11', 'blog', 'article', None,
     {'@type': 'BlogPosting', 'author': PERSON_REF, 'datePublished': '2026-11-01'}),
    ('projects/calm/index.html', '/projects/calm', 'calm', 'article', 'CALM',
     code('CALM: Conformer Audio-Language Model', 'https://github.com/astroanand-6e/Music_genre_classification',
          ['audio-language model', 'music genre classification', 'FMA', 'cross-attention', 'PyTorch'])),
    ('projects/astro/index.html', '/projects/astro', 'astro', 'article', 'Astro',
     code('Astro: local-first code-switch dictation', 'https://github.com/astroanand-6e/astro-dict-ally/tree/astro',
          ['speech recognition', 'code-switching', 'Hinglish', 'on-device', 'MLX', 'Tauri'])),
    ('projects/coronarysam2/index.html', '/projects/coronarysam2', 'coronarysam2', 'article', 'CoronarySAM2',
     code('CoronarySAM2: interactive coronary artery segmentation', 'https://github.com/astroanand-6e/coronary_SAM2',
          ['SAM2', 'medical image segmentation', 'angiography', 'PEFT', 'Gradio'],
          extra={'sameAs': ['https://huggingface.co/spaces/astroanand/CoronarySAM2_FT']})),
    ('projects/cdss/index.html', '/projects/cdss', 'cdss', 'article', 'Failure-aware decision support',
     code('Failure-aware clinical decision support (team project)',
          'https://github.com/Dhruv2422/Reliable-Clinical-Decision-Support-A-Failure-Aware-Multi-Agent-System',
          ['clinical decision support', 'multi-agent', 'MIMIC-IV', 'out-of-distribution detection'], contributor=True)),
    ('projects/resformer/index.html', '/projects/resformer', 'resformer', 'article', 'ResFormer',
     {'@type': 'ScholarlyArticle',
      'headline': 'ResFormer: Integrating Deep Learning Models for Atrial Fibrillation Detection using ECG',
      'author': [PERSON_REF, {'@type': 'Person', 'name': 'Y. Sharma'}, {'@type': 'Person', 'name': 'S. Nahak'}],
      'datePublished': '2025-04', 'keywords': ['atrial fibrillation', 'ECG', 'ResNet', 'Transformer'],
      'sameAs': ['https://github.com/astroanand-6e/ResFormerAF']}),
    ('projects/ventureviz/index.html', '/projects/ventureviz', 'ventureviz', 'article', 'VentureViz',
     code('VentureViz: a web of AI startups and investors', 'https://github.com/astroanand-6e/A_web_of_AI_startups_and_investors',
          ['D3.js', 'network visualization', 'AI startups', 'venture capital'],
          extra={'sameAs': ['https://astroanand-6e.github.io/A_web_of_AI_startups_and_investors/']})),
    ('projects/portfolio/index.html', '/projects/portfolio', 'portfolio', 'article', 'This website',
     code('A scroll film, built with coding agents', 'https://github.com/astroanand-6e/astroanand-6e.github.io',
          ['GSAP', 'WebGL', 'Three.js', 'scroll animation', 'Claude Code'])),
]

BLOCK_RE = re.compile(r'\s*<!-- seo:start.*?<!-- seo:end -->', re.S)
LOOSE_RE = re.compile(r'\s*<(?:meta (?:property="og:[^"]+"|name="twitter:[^"]+")|link rel="canonical")[^>]*>')
LDJSON_RE = re.compile(r'\s*<script type="application/ld\+json">.*?</script>', re.S)


def attr(v):
    return html.escape(v, quote=True)


def head_text(doc, pattern):
    m = re.search(pattern, doc, re.S)
    return html.unescape(m.group(1)).strip() if m else ''


def schema(url, title, desc, image, crumb, entity):
    if entity is None:
        profile = {'@type': 'ProfilePage', '@id': f'{SITE}/#profile', 'url': url, 'name': title,
                   'mainEntity': {'@id': PERSON_ID}, 'isPartOf': {'@id': WEBSITE_ID}}
        website = {'@type': 'WebSite', '@id': WEBSITE_ID, 'url': f'{SITE}/', 'name': 'Anand Thakkar',
                   'publisher': {'@id': PERSON_ID}, 'inLanguage': 'en'}
        return {'@context': 'https://schema.org', '@graph': [PERSON, website, profile]}
    main = {'url': url, 'description': desc, 'image': image, 'isPartOf': {'@id': WEBSITE_ID}, **entity}
    main.setdefault('name', title.split(' | ')[0])
    if main['@type'] in ('BlogPosting', 'TechArticle'):
        main.setdefault('headline', title.split(' | ')[0])
    graph = [main]
    if crumb:
        graph.append({'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Anand Thakkar', 'item': f'{SITE}/'},
            {'@type': 'ListItem', 'position': 2, 'name': crumb, 'item': url},
        ]})
    return {'@context': 'https://schema.org', '@graph': graph}


def block(path, slug, og_type, crumb, entity, title, desc, needs_analytics):
    url = f'{SITE}{path}'
    image = f'{SITE}/assets/og/{slug}.jpg'
    data = json.dumps(schema(url, title, desc, image, crumb, entity), ensure_ascii=False, indent=2)
    tags = [
        f'<link rel="canonical" href="{url}">',
        f'<meta property="og:type" content="{og_type}">',
        '<meta property="og:site_name" content="Anand Thakkar">',
        '<meta property="og:locale" content="en_US">',
        f'<meta property="og:title" content="{attr(title)}">',
        f'<meta property="og:description" content="{attr(desc)}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{image}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{attr(title)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{attr(title)}">',
        f'<meta name="twitter:description" content="{attr(desc)}">',
        f'<meta name="twitter:image" content="{image}">',
    ]
    script = '<script type="application/ld+json">\n' + data + '\n  </script>'
    if needs_analytics:  # page views on every page, not just the home page (js/analytics.js)
        tags.append('<script type="module" src="/js/analytics.js"></script>')
    return '\n  <!-- seo:start (generated by tools/seo/apply.py) -->\n  ' + '\n  '.join(tags + [script]) + '\n  <!-- seo:end -->'


def apply(file, path, slug, og_type, crumb, entity):
    target = ROOT / file
    doc = target.read_text()
    head_end = doc.index('</head>')
    head, rest = doc[:head_end], doc[head_end:]
    title = head_text(head, r'<title>(.*?)</title>')
    desc = head_text(head, r'<meta name="description" content="([^"]*)"')
    if not title or not desc:
        raise SystemExit(f'{file}: needs a <title> and a meta description')
    head = LDJSON_RE.sub('', LOOSE_RE.sub('', BLOCK_RE.sub('', head)))
    anchor = re.search(r'<meta name="description" content="[^"]*">', head)
    needs_analytics = 'analytics.js' not in head
    head = head[:anchor.end()] + block(path, slug, og_type, crumb, entity, title, desc, needs_analytics) + head[anchor.end():]
    target.write_text(head + rest)
    return file


if __name__ == '__main__':
    for page in PAGES:
        print(apply(*page))
