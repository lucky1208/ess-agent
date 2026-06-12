import re

with open(r'E:\project\储能\ess-platform\index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. HTML elements with Chinese but NO data-i18n attribute
html_issues = []
# 2. JS dynamic content with hardcoded Chinese (innerHTML/textContent/innerText)
js_dynamic_issues = []
# 3. JS string literals with Chinese (not in translations, not in t() calls)
js_string_issues = []

skip_content = [
    'translations', 'console.', 'font-family', 'ESS_DIAGRAM', '版权所有',
    'tCat', 'tFeature', 'tCool', 'tFire', 'tSpec', "t('",
    'skillContent', 'PRODUCTS', 'SKILL_',
    'ESS_SKILL', 'renderDiagram', 'DIAGRAM_ICONS', 'TYPE_ALIAS',
    'MutationObserver', 'detailModal', 'vercel', 'maxDuration',
    'BAILIAN_API', 'DEEPSEEK_API', 'GLM_API', 'MINIMAX_API',
    'CAT_I18N_MAP', 'FEATURE_I18N', 'COOL_I18N', 'FIRE_I18N',
    'SPEC_I18N',
]

for i, line in enumerate(lines, 1):
    stripped = line.strip()
    if not stripped:
        continue
    if any(p in line for p in skip_content):
        continue
    if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('* ') or stripped.startswith('<!--'):
        continue
    
    chinese = re.findall(r'[\u4e00-\u9fff]{2,}', line)
    if not chinese:
        continue
    
    # Check HTML elements without data-i18n
    if '<' in line and '>' in line and 'data-i18n' not in line:
        # Skip SVG text, title, desc
        if stripped.startswith('<text ') or stripped.startswith('<title ') or stripped.startswith('<desc '):
            continue
        # Skip style tags, script tags with no visible text
        if '<style' in line or '<script' in line:
            continue
        # Skip lines that are inside translations object (line 2163+)
        if i > 2160 and i < 2600:
            continue
        html_issues.append((i, stripped[:150]))
    
    # Check JS dynamic content
    if ('innerHTML' in line or 'textContent' in line or 'innerText' in line) and 'data-i18n' not in line:
        js_dynamic_issues.append((i, stripped[:150]))

print("=== HTML elements WITHOUT data-i18n but WITH Chinese ===")
print(f"Total: {len(html_issues)}")
for lineno, text in html_issues[:60]:
    print(f"  {lineno}: {text}")
if len(html_issues) > 60:
    print(f"  ... and {len(html_issues)-60} more")

print(f"\n=== JS dynamic content (innerHTML/textContent) with Chinese ===")
print(f"Total: {len(js_dynamic_issues)}")
for lineno, text in js_dynamic_issues:
    print(f"  {lineno}: {text}")
