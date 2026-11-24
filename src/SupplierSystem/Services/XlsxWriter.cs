using System.IO.Compression;
using System.Security;
using System.Text;

namespace SupplierSystem.Services;

/// <summary>
/// مولّد ملفات Excel (.xlsx) بسيط بدون مكتبات خارجية: ورقة واحدة باتجاه من اليمين لليسار،
/// مع أنماط للعنوان والترويسة والأرقام. كافٍ لتصدير القوائم في المنظومة التجريبية.
/// </summary>
public class XlsxWriter
{
    public enum Style { Normal = 0, Header = 1, Number = 2, Title = 3, Muted = 4 }

    private readonly List<(object?[] Cells, Style Style)> _rows = new();
    private readonly double[] _widths;
    private readonly string _sheetName;

    public XlsxWriter(string sheetName, params double[] columnWidths)
    {
        _sheetName = sheetName.Length > 31 ? sheetName[..31] : sheetName;
        _widths = columnWidths;
    }

    public XlsxWriter Title(string text) { _rows.Add((new object?[] { text }, Style.Title)); return this; }
    public XlsxWriter Info(params object?[] cells) { _rows.Add((cells, Style.Muted)); return this; }
    public XlsxWriter Blank() { _rows.Add((Array.Empty<object?>(), Style.Normal)); return this; }
    public XlsxWriter Header(params string[] cells) { _rows.Add((cells.Cast<object?>().ToArray(), Style.Header)); return this; }
    public XlsxWriter Row(params object?[] cells) { _rows.Add((cells, Style.Normal)); return this; }

    private static string Col(int i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = (char)('A' + m) + s; i = (i - 1) / 26; } return s; }

    private static string Cell(string r, object? v, Style rowStyle)
    {
        switch (v)
        {
            case null: return "";
            case decimal or double or float or int or long:
                var num = Convert.ToDecimal(v).ToString(System.Globalization.CultureInfo.InvariantCulture);
                var st = rowStyle == Style.Normal ? (int)Style.Number : (int)rowStyle;
                return $"<c r=\"{r}\" s=\"{st}\"><v>{num}</v></c>";
            case DateOnly d: v = d.ToString("yyyy-MM-dd"); break;
            case DateTime dt: v = dt.ToString("yyyy-MM-dd HH:mm"); break;
        }
        var text = SecurityElement.Escape(v.ToString() ?? "");
        return $"<c r=\"{r}\" s=\"{(int)rowStyle}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{text}</t></is></c>";
    }

    public byte[] ToBytes()
    {
        var sheet = new StringBuilder();
        sheet.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
        sheet.Append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">");
        sheet.Append("<sheetViews><sheetView workbookViewId=\"0\" rightToLeft=\"1\"/></sheetViews>");
        if (_widths.Length > 0)
        {
            sheet.Append("<cols>");
            for (var i = 0; i < _widths.Length; i++) sheet.Append($"<col min=\"{i + 1}\" max=\"{i + 1}\" width=\"{_widths[i]}\" customWidth=\"1\"/>");
            sheet.Append("</cols>");
        }
        sheet.Append("<sheetData>");
        for (var r = 0; r < _rows.Count; r++)
        {
            var (cells, style) = _rows[r];
            sheet.Append($"<row r=\"{r + 1}\"{(style == Style.Title ? " ht=\"26\" customHeight=\"1\"" : "")}>");
            for (var c = 0; c < cells.Length; c++) sheet.Append(Cell($"{Col(c)}{r + 1}", cells[c], style));
            sheet.Append("</row>");
        }
        sheet.Append("</sheetData></worksheet>");

        const string styles = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
            "<numFmts count=\"1\"><numFmt numFmtId=\"164\" formatCode=\"#,##0.##\"/></numFmts>" +
            "<fonts count=\"4\"><font><sz val=\"11\"/><name val=\"Arial\"/></font><font><b/><sz val=\"11\"/><name val=\"Arial\"/></font>" +
            "<font><b/><sz val=\"15\"/><color rgb=\"FF0B5C8A\"/><name val=\"Arial\"/></font><font><sz val=\"10\"/><color rgb=\"FF5B6B80\"/><name val=\"Arial\"/></font></fonts>" +
            "<fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill>" +
            "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFE8F2F8\"/><bgColor indexed=\"64\"/></patternFill></fill></fills>" +
            "<borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border>" +
            "<border><left/><right/><top/><bottom style=\"thin\"><color rgb=\"FFC6D2DE\"/></bottom><diagonal/></border></borders>" +
            "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>" +
            "<cellXfs count=\"5\">" +
            "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyBorder=\"1\"><alignment horizontal=\"right\" vertical=\"center\" wrapText=\"1\"/></xf>" +
            "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\"><alignment horizontal=\"right\" vertical=\"center\" wrapText=\"1\"/></xf>" +
            "<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyNumberFormat=\"1\" applyBorder=\"1\"><alignment horizontal=\"right\" vertical=\"center\"/></xf>" +
            "<xf numFmtId=\"0\" fontId=\"2\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"><alignment horizontal=\"right\"/></xf>" +
            "<xf numFmtId=\"164\" fontId=\"3\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyNumberFormat=\"1\"><alignment horizontal=\"right\"/></xf>" +
            "</cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>";

        var files = new Dictionary<string, string>
        {
            ["[Content_Types].xml"] = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
                "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>" +
                "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>",
            ["_rels/.rels"] = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>",
            ["xl/workbook.xml"] = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">" +
                $"<sheets><sheet name=\"{SecurityElement.Escape(_sheetName)}\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
            ["xl/_rels/workbook.xml.rels"] = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
                "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>" +
                "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>",
            ["xl/worksheets/sheet1.xml"] = sheet.ToString(),
            ["xl/styles.xml"] = styles,
        };

        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
            foreach (var (name, content) in files)
            {
                var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
                using var w = new StreamWriter(entry.Open(), new UTF8Encoding(false));
                w.Write(content);
            }
        return ms.ToArray();
    }

    public const string ContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}
