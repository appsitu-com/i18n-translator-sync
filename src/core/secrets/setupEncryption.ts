import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PassphraseManager } from './passphraseManager';
import { encryptApiKey, isEncrypted } from './keyEncryption';
import { Logger } from '../util/baseLogger';
import { TRANSLATOR_ENV } from '../constants';

/**
 * VSCode UI option to setup encryption key for API keys stored in translator.env
 */
export async function setupEncryption(
  context: vscode.ExtensionContext,
  passphraseManager: PassphraseManager,
  logger: Logger
): Promise<void> {
  try {
    // Prompt for new passphrase
    const newPassphrase = await vscode.window.showInputBox({
      prompt: 'Enter a strong passphrase to encrypt your API keys',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'Enter passphrase (minimum 8 characters)',
      validateInput: (value) => {
        if (!value || value.length < 8) {
          return 'Passphrase must be at least 8 characters long';
        }
        return null;
      }
    });

    if (!newPassphrase) {
      logger.info('Encryption setup cancelled');
      return;
    }

    // Confirm passphrase
    const confirmPassphrase = await vscode.window.showInputBox({
      prompt: 'Confirm your passphrase',
      password: true,
      ignoreFocusOut: true
    });

    if (!confirmPassphrase) {
      logger.info('Encryption setup cancelled');
      return;
    }

    if (newPassphrase !== confirmPassphrase) {
      vscode.window.showErrorMessage('Passphrases do not match. Please try again.');
      logger.error('Passphrases do not match');
      return;
    }

    // Set the new passphrase
    await passphraseManager.setPassphrase(newPassphrase);

    // Find workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showInformationMessage('No workspace folder found. API keys will be encrypted when entered.');
      return;
    }

    // Look for translator.env file
    const envPath = path.join(workspaceRoot, TRANSLATOR_ENV);
    if (!fs.existsSync(envPath)) {
      vscode.window.showInformationMessage('No existing API keys found. Keys will be encrypted when entered.');
      return;
    }

    // Ask if user wants to encrypt existing keys
    const shouldEncrypt = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: 'Do you want to encrypt existing API keys in translator.env?',
      ignoreFocusOut: true
    });

    if (shouldEncrypt !== 'Yes') {
      vscode.window.showInformationMessage('Existing API keys were not encrypted. New keys will be encrypted.');
      return;
    }

    // Parse the .env file
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = dotenv.parse(envContent);

    // Track encrypted keys
    let encryptedCount = 0;
    let skippedCount = 0;
    const updatedEnvVars: Record<string, string> = {};

    // Process each environment variable
    for (const [key, value] of Object.entries(envVars)) {
      if (key.endsWith('_KEY') && value && !isEncrypted(value)) {
        try {
          // Encrypt API keys
          const encryptedValue = encryptApiKey(value, newPassphrase);
          updatedEnvVars[key] = encryptedValue;
          encryptedCount++;
        } catch (error) {
          logger.error(`Failed to encrypt key ${key}: ${error}`);
          updatedEnvVars[key] = value;
          skippedCount++;
        }
      } else {
        // Keep non-API keys or already encrypted keys as is
        updatedEnvVars[key] = value;
        if (key.endsWith('_KEY') && isEncrypted(value)) {
          skippedCount++;
        }
      }
    }

    // Write back the updated .env file
    const updatedContent = Object.entries(updatedEnvVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    fs.writeFileSync(envPath, updatedContent);

    vscode.window.showInformationMessage(
      `Encryption setup complete. Encrypted ${encryptedCount} API keys. Skipped ${skippedCount} keys that were already encrypted or invalid.`
    );
    logger.info(`Encryption setup complete. Encrypted ${encryptedCount} API keys, skipped ${skippedCount}.`);
  } catch (error) {
    const errorMessage = `Error setting up encryption: ${error instanceof Error ? error.message : String(error)}`;
    vscode.window.showErrorMessage(errorMessage);
    logger.error(errorMessage);
  }
}