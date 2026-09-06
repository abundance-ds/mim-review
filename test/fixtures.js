import { zipSync, strToU8 } from 'fflate';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export function docxFixture() {
  const contents = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Study of learning methods</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">We recruited </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>24 volunteers</w:t></w:r><w:r><w:t xml:space="preserve"> from one university. Participants selected their preferred study method.</w:t></w:r></w:p><w:p><w:r><w:t>The difference was not statistically significant (p = 0.12). We therefore conclude that the methods are equivalent.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Group</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Mean</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12.5</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>',
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(contents).map(([path, text]) => [path, strToU8(text)]))));
}

export async function pdfFixture({ empty = false, sparsePage = false } = {}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage();
  if (!empty) {
    page.drawText('Research manuscript', { x: 50, y: 740, size: 20, font });
    page.drawText('We recruited 24 volunteers from one university.', { x: 50, y: 690, size: 12, font });
    page.drawText('The difference was not statistically significant (p = 0.12).', { x: 50, y: 660, size: 12, font });
  }
  if (sparsePage) pdf.addPage();
  return Buffer.from(await pdf.save());
}
