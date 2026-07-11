import * as vscode from 'vscode'
import PhpParserModule from 'php-parser'

const PhpParser = PhpParserModule as any
const MAX_SYMBOL_NAME_LENGTH = 40
const TEST_NAMES = ['it', 'test']
const HOOK_NAMES = ['beforeEach', 'afterEach', 'beforeAll', 'afterAll']
const DATASET_NAMES = ['dataset']
const DESCRIBED_NAMES = [...TEST_NAMES, 'describe', ...DATASET_NAMES, 'arch']
const CALL_NAMES = [...DESCRIBED_NAMES, ...HOOK_NAMES]

type AstNode = {
    kind?: string
    loc?: {
        start: { line: number; column: number; offset: number }
        end: { line: number; column: number; offset: number }
    }
    [key: string]: unknown
}

const parser = new PhpParser({
    parser: { php7: true, suppressErrors: true },
    ast: { withPositions: true },
})

function range(node: AstNode) {
    const start = node.loc!.start
    const end = node.loc!.end

    return new vscode.Range(
        new vscode.Position(start.line - 1, start.column),
        new vscode.Position(end.line - 1, end.column),
    )
}

function symbolName(description: string) {
    return description.length > MAX_SYMBOL_NAME_LENGTH
        ? `${description.slice(0, MAX_SYMBOL_NAME_LENGTH - 1)}…`
        : description
}

function tagFor(name: string) {
    if (TEST_NAMES.includes(name)) return 'Pest[Cases]'
    if (HOOK_NAMES.includes(name)) return 'Pest[Hooks]'
    if (DATASET_NAMES.includes(name)) return 'Pest[Datasets]'

    return 'Pest'
}

function pestCalls(node: AstNode, calls: AstNode[] = [], seen = new Set<AstNode>()) {
    if (seen.has(node)) return calls
    seen.add(node)

    if (node.kind === 'call' && CALL_NAMES.includes((node.what as AstNode)?.name as string)) {
        calls.push(node)
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === 'object') {
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child === 'object') pestCalls(child as AstNode, calls, seen)
                }
            } else {
                pestCalls(value as AstNode, calls, seen)
            }
        }
    }

    return calls
}

function callSymbol(call: AstNode, source: string, document: vscode.TextDocument) {
    if (!call.loc) return undefined

    const name = (call.what as AstNode)?.name as string
    const described = DESCRIBED_NAMES.includes(name)
    const description = (call.arguments as AstNode[])?.[0]
    const value = described && description?.loc
        ? description.kind === 'string' && typeof description.value === 'string'
            ? description.value
            : source.slice(description.loc.start.offset, description.loc.end.offset)
        : undefined

    if (described && value === undefined) return undefined

    const label = value === undefined ? `${name}()` : `${name}(${symbolName(value)})`
    return new vscode.SymbolInformation(
        label,
        vscode.SymbolKind.Method,
        tagFor(name),
        new vscode.Location(document.uri, range(call)),
    )
}

export class PestSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.SymbolInformation[] {
        let ast: AstNode

        try {
            ast = parser.parseCode(document.getText(), document.fileName) as unknown as AstNode
        } catch {
            return []
        }

        const source = document.getText()
        return pestCalls(ast).flatMap((call) => {
            const symbol = callSymbol(call, source, document)
            return symbol ? [symbol] : []
        })
    }
}
