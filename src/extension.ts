import * as vscode from 'vscode'
import { PestSymbolProvider } from './pestSymbolProvider'

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider({ language: 'php' }, new PestSymbolProvider()),
    )
}

export function deactivate() { }
