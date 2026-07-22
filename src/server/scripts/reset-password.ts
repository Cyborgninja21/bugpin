import { initDatabase, initSchema, runMigrations, closeDatabase } from '../database/database.js';
import { usersRepo } from '../database/repositories/users.repo.js';
import { usersService } from '../services/users.service.js';
import { isValidEmail } from '../utils/validators.js';

// Unambiguous alphabet (no 0/O/1/I/l) so a temporary password can be read
// aloud or copied from a terminal without transcription errors.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PASSWORD_LENGTH = 18;

function generateTemporaryPassword(): string {
  const bytes = new Uint8Array(PASSWORD_LENGTH);
  crypto.getRandomValues(bytes);
  let password = '';
  for (const byte of bytes) {
    password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
  }
  return password;
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();

  if (!email || !isValidEmail(email)) {
    console.error('Usage: bun run reset-password <email>');
    process.exit(1);
  }

  initDatabase();
  await initSchema();
  await runMigrations();

  const user = await usersRepo.findByEmail(email);

  if (!user) {
    console.error(`No user found with email: ${email}`);
    closeDatabase();
    process.exit(1);
  }

  const temporaryPassword = generateTemporaryPassword();
  const result = await usersService.resetPassword(user.id, temporaryPassword);

  closeDatabase();

  if (!result.success) {
    console.error(`Failed to reset password: ${result.error}`);
    process.exit(1);
  }

  console.log('Password reset successful.');
  console.log(`  Email:    ${user.email}`);
  console.log(`  Password: ${temporaryPassword}`);
  console.log('Log in with this temporary password and change it immediately.');
}

main().catch((error) => {
  console.error('Unexpected error resetting password:', error);
  process.exit(1);
});
