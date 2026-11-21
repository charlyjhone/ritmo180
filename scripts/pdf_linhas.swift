// Lê PDFs com o PDFKit do macOS, sem instalar nada.
//   swift scripts/pdf_linhas.swift linhas <arquivo.pdf> <saida.json>
//     cada linha de texto com página e posição (pontos, origem no canto superior esquerdo).
//   swift scripts/pdf_linhas.swift recortes <arquivo.pdf> <pedidos.json>
//     pedidos: [{"page":1,"x":0,"y":0,"w":100,"h":50,"out":"fig.png"}], na mesma convenção.
//     grava em <pedidos.json>.tinta.json a fração de pixels escuros de cada recorte.
import AppKit
import PDFKit

let args = CommandLine.arguments
guard args.count >= 4, let doc = PDFDocument(url: URL(fileURLWithPath: args[2])) else {
  FileHandle.standardError.write("uso: linhas|recortes <pdf> <json>\n".data(using: .utf8)!)
  exit(1)
}

struct Line: Codable { let page: Int; let x: Double; let y: Double; let w: Double; let h: Double; let text: String }
struct Crop: Codable { let page: Int; let x: Double; let y: Double; let w: Double; let h: Double; let out: String }

if args[1] == "linhas" {
  // Monta as linhas caractere por caractere: um vão horizontal grande (coluna, célula de tabela)
  // separa trechos, que saem como registros distintos na mesma altura.
  var lines: [Line] = []
  var sizes: [[Double]] = []
  for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let box = page.bounds(for: .mediaBox)
    sizes.append([box.width, box.height])
    var glyphs: [(CGRect, String)] = []
    // Texto e posição de cada caractere pela mesma seleção (os índices de page.string não batem).
    for k in 0..<page.numberOfCharacters {
      guard let sel = page.selection(for: NSRange(location: k, length: 1)), let ch = sel.string else { continue }
      if ch == "\n" || ch == "\r" { continue }
      let b = sel.bounds(for: page)
      if b.width <= 0 || b.height <= 0 { if ch == " " { glyphs.append((CGRect(x: glyphs.last?.0.maxX ?? 0, y: glyphs.last?.0.minY ?? 0, width: 0.1, height: 0.1), " ")) }; continue }
      // A seleção do fim de linha repete o último caractere, na mesma posição.
      if let last = glyphs.last, last.0 == b { continue }
      glyphs.append((b, ch))
    }
    // Agrupa por linha de base (tolerância de 2,5 pt) e ordena da esquerda para a direita.
    var rows: [(y: CGFloat, items: [(CGRect, String)])] = []
    for g in glyphs.sorted(by: { $0.0.minY > $1.0.minY }) {
      if let last = rows.indices.last, abs(rows[last].y - g.0.minY) < 2.5 { rows[last].items.append(g) } else { rows.append((g.0.minY, [g])) }
    }
    for row in rows {
      let items = row.items.sorted { $0.0.minX < $1.0.minX }
      var seg: [(CGRect, String)] = []
      func flush() {
        let visible = seg.filter { $0.1.trimmingCharacters(in: .whitespaces) != "" }
        guard let first = visible.first else { seg = []; return }
        let rect = visible.dropFirst().reduce(first.0) { $0.union($1.0) }
        let t = seg.map { $0.1 }.joined().trimmingCharacters(in: .whitespaces)
        lines.append(Line(page: i + 1, x: rect.minX, y: box.height - rect.maxY, w: rect.width, h: rect.height, text: t))
        seg = []
      }
      var lastMax: CGFloat? = nil
      var blanks = 0
      for g in items {
        let blank = g.1.trimmingCharacters(in: .whitespaces) == ""
        if blank { blanks += 1 }
        // Vão grande separa trechos (coluna, célula de tabela). Um espaço só, mesmo largo, é linha
        // justificada com poucas palavras: só quebra acima de 30 pt.
        if let m = lastMax, !blank, g.0.minX - m > (blanks == 1 ? 30 : 14) { flush() }
        // Símbolo que o PDF não expõe como texto (uma seta de equação): vão médio sem espaço, ou vários
        // espaços seguidos. Marca com dois espaços para o conversor tratar a linha como imagem. O espaço
        // único e largo da linha justificada não conta.
        if let m = lastMax, !blank, g.0.minX - m > 8, g.0.minX - m <= 14, blanks != 1 { seg.append((CGRect(x: m, y: g.0.minY, width: 0.1, height: 0.1), "  ")) }
        seg.append(g)
        if !blank { lastMax = g.0.maxX; blanks = 0 }
      }
      flush()
    }
  }
  let data = try JSONSerialization.data(withJSONObject: [
    "sizes": sizes,
    "lines": try JSONSerialization.jsonObject(with: JSONEncoder().encode(lines)),
  ])
  try data.write(to: URL(fileURLWithPath: args[3]))
  print("\(doc.pageCount) páginas, \(lines.count) linhas")
} else if args[1] == "recortes" {
  let crops = try JSONDecoder().decode([Crop].self, from: Data(contentsOf: URL(fileURLWithPath: args[3])))
  let scale = 2.0
  var inks: [Double] = []
  for c in crops {
    guard let page = doc.page(at: c.page - 1) else { continue }
    let box = page.bounds(for: .mediaBox)
    let width = Int(c.w * scale), height = Int(c.h * scale)
    guard let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    ctx.scaleBy(x: scale, y: scale)
    // Converte o topo-esquerda pedido para a origem embaixo do PDF.
    ctx.translateBy(x: -c.x, y: -(box.height - c.y - c.h))
    page.draw(with: .mediaBox, to: ctx)
    guard let image = ctx.makeImage() else { continue }
    let rep = NSBitmapImageRep(cgImage: image)
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: c.out))
    // Fração de pixels não brancos: o chamador descarta recorte vazio.
    var ink = 0
    let step = 2
    for yy in stride(from: 0, to: rep.pixelsHigh, by: step) {
      for xx in stride(from: 0, to: rep.pixelsWide, by: step) {
        if let color = rep.colorAt(x: xx, y: yy), color.brightnessComponent < 0.85 { ink += 1 }
      }
    }
    inks.append(Double(ink) / Double(max(1, (rep.pixelsHigh / step) * (rep.pixelsWide / step))))
  }
  try JSONSerialization.data(withJSONObject: inks).write(to: URL(fileURLWithPath: args[3] + ".tinta.json"))
  print("\(crops.count) recortes")
}
