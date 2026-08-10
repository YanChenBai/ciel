import { installModel } from './model.ts';
import { createVoiceprint } from './voiceprint.ts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const command = args.shift();
  if (args[0] === '--') args.shift();

  if (command === 'model') {
    await installModel(args);
    return;
  }
  if (command === 'voiceprint') {
    await createVoiceprint(args);
    return;
  }

  process.stdout.write(
    'Usage: asr <command> [options]\n\n' +
      'Commands:\n' +
      '  model       Install ASR, VAD, and speaker models\n' +
      '  voiceprint  Create a voiceprint from WAV samples\n',
  );
  if (command && command !== 'help' && command !== '--help' && command !== '-h') {
    process.exitCode = 2;
  }
}

await main();
