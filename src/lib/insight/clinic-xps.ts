function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number) {
  return [value & 255, (value >> 8) & 255]
}

function u32(value: number) {
  return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255]
}

function zipStore(files: { path: string; text: string }[]) {
  const encoder = new TextEncoder()
  const locals: number[] = []
  const central: number[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.path)
    const body = encoder.encode(file.text)
    const crc = crc32(body)
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(body.length), ...u32(body.length), ...u16(name.length), ...u16(0), ...name, ...body]
    locals.push(...local)
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(body.length), ...u32(body.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name)
    offset += local.length
  }
  const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(central.length), ...u32(offset), ...u16(0)]
  return new Uint8Array([...locals, ...central, ...end])
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;")
}

export type VisitSheet = {
  id: string
  visit_date: string
  clinician: string
  complaint: string
  diagnosis: string
  consult_fee: number
  notes: string
  patient: string
  age: number
  sex: string
  allergies: string
  history: string
  phone: string
  city: string
  lines: { name: string; strength: string; quantity: number; unit_price: number }[]
  drugs: number
  total: number
  clinic: string
}

export function visitXps(sheet: VisitSheet) {
  const lines = [
    sheet.clinic,
    "Diabetes and thyroid",
    `${sheet.visit_date}  ${sheet.id}`,
    sheet.patient,
    `${sheet.sex}, ${sheet.age} years  ${sheet.city}  ${sheet.phone}`,
    `Allergies: ${sheet.allergies}`,
    `History: ${sheet.history}`,
    `Seen by ${sheet.clinician}`,
    `Complaint: ${sheet.complaint}`,
    `Diagnosis: ${sheet.diagnosis}`,
    sheet.notes,
    ...sheet.lines.map((line) => `${line.name} ${line.strength}  x${line.quantity}  Rs ${line.quantity * line.unit_price}`),
    `Consult fee Rs ${sheet.consult_fee}`,
    `Medicines Rs ${sheet.drugs}`,
    `Total Rs ${sheet.total}`,
    "Simulated clinic book. Not a real patient.",
  ]
  const glyphs = lines
    .map((line, index) => `<Glyphs OriginX="48" OriginY="${72 + index * 28}" FontRenderingEmSize="14" Fill="#1c1915" UnicodeString="${escapeXml(line)}" />`)
    .join("")
  const page = `<?xml version="1.0" encoding="utf-8"?><FixedPage xmlns="http://schemas.microsoft.com/xps/2005/06" Width="816" Height="1056" xml:lang="en-US">${glyphs}</FixedPage>`
  const bytes = zipStore([
    {
      path: "[Content_Types].xml",
      text: `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="fdseq" ContentType="application/vnd.ms-package.xps-fixeddocumentsequence+xml"/><Default Extension="fdoc" ContentType="application/vnd.ms-package.xps-fixeddocument+xml"/><Default Extension="fpage" ContentType="application/vnd.ms-package.xps-fixedpage+xml"/></Types>`,
    },
    {
      path: "_rels/.rels",
      text: `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/xps/2005/06/fixedrepresentation" Target="/FixedDocumentSequence.fdseq"/></Relationships>`,
    },
    {
      path: "FixedDocumentSequence.fdseq",
      text: `<?xml version="1.0" encoding="utf-8"?><FixedDocumentSequence xmlns="http://schemas.microsoft.com/xps/2005/06"><DocumentReference Source="Documents/1/FixedDocument.fdoc"/></FixedDocumentSequence>`,
    },
    {
      path: "Documents/1/FixedDocument.fdoc",
      text: `<?xml version="1.0" encoding="utf-8"?><FixedDocument xmlns="http://schemas.microsoft.com/xps/2005/06"><PageContent Source="Pages/1.fpage"/></FixedDocument>`,
    },
    { path: "Documents/1/Pages/1.fpage", text: page },
  ])
  return new Blob([bytes], { type: "application/vnd.ms-xpsdocument" })
}
