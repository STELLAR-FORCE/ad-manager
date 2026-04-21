"""Google Ads API Token Application 用の設計ドキュメント PDF を生成する."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)

OUTPUT_PATH = "/Users/stf59/Downloads/google-ads-api-design-doc.pdf"

# Colors
PRIMARY = HexColor("#1a73e8")
DARK = HexColor("#202124")
GRAY = HexColor("#5f6368")
LIGHT_BG = HexColor("#f8f9fa")
BORDER = HexColor("#dadce0")
WHITE = HexColor("#ffffff")

# Styles
style_title = ParagraphStyle(
    "Title",
    fontSize=20,
    leading=26,
    textColor=DARK,
    fontName="Helvetica-Bold",
    spaceAfter=4,
)
style_subtitle = ParagraphStyle(
    "Subtitle",
    fontSize=11,
    leading=15,
    textColor=GRAY,
    fontName="Helvetica",
    spaceAfter=16,
)
style_h2 = ParagraphStyle(
    "H2",
    fontSize=13,
    leading=18,
    textColor=PRIMARY,
    fontName="Helvetica-Bold",
    spaceBefore=14,
    spaceAfter=6,
)
style_body = ParagraphStyle(
    "Body",
    fontSize=9.5,
    leading=14,
    textColor=DARK,
    fontName="Helvetica",
    spaceAfter=4,
)
style_bullet = ParagraphStyle(
    "Bullet",
    fontSize=9.5,
    leading=14,
    textColor=DARK,
    fontName="Helvetica",
    leftIndent=16,
    spaceAfter=2,
)
style_diagram = ParagraphStyle(
    "Diagram",
    fontSize=10,
    leading=16,
    textColor=PRIMARY,
    fontName="Courier-Bold",
    alignment=1,  # center
    spaceAfter=4,
)


def bullet(text: str) -> Paragraph:
    return Paragraph(f"\u2022  {text}", style_bullet)


def build_pdf() -> None:
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=letter,
        topMargin=0.6 * inch,
        bottomMargin=0.5 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
    )

    story: list = []

    # Title
    story.append(Paragraph("Google Ads API Tool Design Document", style_title))
    story.append(
        Paragraph("STELLAR FORCE Inc. \u2014 Internal ETL Pipeline", style_subtitle)
    )
    story.append(
        HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=10)
    )

    # 1. Overview
    story.append(Paragraph("1. Overview", style_h2))
    overview_data = [
        ["Tool Name", "Ad Manager ETL Pipeline"],
        ["Purpose", "Read-only data extraction from Google Ads API for internal reporting"],
        ["Developer", "STELLAR FORCE Inc. (k.nakatomi@stellarforce.com)"],
        ["MCC Account ID", "358-207-3115"],
        ["Access Level", "Basic Access (read-only)"],
    ]
    t = Table(overview_data, colWidths=[1.6 * inch, 5.0 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), LIGHT_BG),
                ("TEXTCOLOR", (0, 0), (0, -1), GRAY),
                ("TEXTCOLOR", (1, 0), (1, -1), DARK),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9.5),
                ("LEADING", (0, 0), (-1, -1), 14),
                ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(t)

    # 2. Architecture
    story.append(Paragraph("2. Architecture", style_h2))
    story.append(
        Paragraph(
            "Google Ads API  -->  ETL Pipeline (Python)  -->  BigQuery  -->  Dashboard (Next.js)",
            style_diagram,
        )
    )
    story.append(
        Paragraph(
            "(read-only GAQL)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
            "(transform)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
            "(storage)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
            "(visualization)",
            ParagraphStyle("DiagramSub", fontSize=8, leading=11, textColor=GRAY, fontName="Helvetica", alignment=1, spaceAfter=4),
        )
    )

    # 3. API Usage
    story.append(Paragraph("3. API Usage", style_h2))
    bullet_items = [
        "<b>API endpoint:</b> GoogleAdsService/Search (GAQL queries)",
        "<b>Access type:</b> Read-only \u2014 no campaign mutations or bid changes",
        "<b>Data extracted:</b> Campaign, Ad Group, Ad, Keyword, Daily Metrics, Search Term reports",
        "<b>Frequency:</b> Daily scheduled sync via GCP Cloud Run Jobs",
        "<b>Date range:</b> Last 7 days rolling window per sync (~10 API calls)",
    ]
    for item in bullet_items:
        story.append(bullet(item))

    # 4. Data Flow
    story.append(Paragraph("4. Data Flow", style_h2))
    flow_items = [
        "Authenticate via OAuth2 refresh token flow",
        "Query Google Ads API using GAQL (GoogleAdsService/Search)",
        "Transform API responses into normalized rows (Pydantic models)",
        "Load data into BigQuery tables (dataset: <b>ad_manager</b>, project: <b>stellarforce-bi</b>)",
        "Internal Next.js dashboard reads from BigQuery to display KPIs and trends",
    ]
    for i, item in enumerate(flow_items, 1):
        story.append(bullet(f"Step {i}: {item}"))

    # 5. Security & Compliance
    story.append(Paragraph("5. Security &amp; Compliance", style_h2))
    sec_items = [
        "OAuth2 credentials stored in <b>GCP Secret Manager</b> (not in source code)",
        "No user data or PII is shared externally",
        "Access restricted to <b>internal employees only</b>",
        "All data remains within the company's GCP project (<b>stellarforce-bi</b>, asia-northeast1)",
        "Source code is in a private GitHub repository",
    ]
    for item in sec_items:
        story.append(bullet(item))

    # 6. Rate Limiting
    story.append(Paragraph("6. Rate Limiting &amp; Responsible Use", style_h2))
    rate_items = [
        "Implements <b>exponential backoff</b> retry (max 3 attempts per request)",
        "Single MCC account sync \u2014 low request volume (~10 API calls per daily run)",
        "No bulk operations, no parallel account processing",
        "Respects Google Ads API rate limits and quota policies",
    ]
    for item in rate_items:
        story.append(bullet(item))

    # Footer
    story.append(Spacer(1, 16))
    story.append(
        HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=6)
    )
    story.append(
        Paragraph(
            "Document prepared by STELLAR FORCE Inc. for Google Ads API Basic Access application.",
            ParagraphStyle("Footer", fontSize=8, textColor=GRAY, fontName="Helvetica-Oblique"),
        )
    )

    doc.build(story)
    print(f"PDF saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    build_pdf()
