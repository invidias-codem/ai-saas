import * as path from 'path';
import { GoIOHarness } from '../../lib/harness/GoIOHarness';

async function main() {
  console.log('--- Initializing GoIOHarness Verification ---');
  
  const workspaceRoot = path.resolve(__dirname, '../../');
  console.log(`Workspace root: ${workspaceRoot}`);
  
  const harness = new GoIOHarness(workspaceRoot);
  
  try {
    console.log('Calling harness.initialize()...');
    await harness.initialize();
    console.log('GoIOHarness initialized successfully!\n');
    
    console.log('--- Test 1: runCommand ("echo Integration success!") ---');
    const cmdResult = await harness.runCommand('echo "Integration success!"');
    console.log('Result:', JSON.stringify(cmdResult, null, 2));
    
    console.log('\n--- Test 2: writeFile ---');
    const testFilePath = 'go-harness/scratch/test_write.txt';
    const writeResult = await harness.writeFile(testFilePath, 'Hello from Go IO Harness IPC!');
    console.log('Result:', JSON.stringify(writeResult, null, 2));

    console.log('\n--- Test 3: readFile ---');
    const readResult = await harness.readFile(testFilePath);
    console.log('Result:', JSON.stringify(readResult, null, 2));

    console.log('\n--- Test 4: patchFile ---');
    const patchResult = await harness.patchFile(
      testFilePath,
      'Hello from Go IO Harness IPC!',
      'Hello from Go IO Harness IPC! [PATCHED]'
    );
    console.log('Result:', JSON.stringify(patchResult, null, 2));

    console.log('\n--- Test 5: readFile (after patch) ---');
    const readAfterPatchResult = await harness.readFile(testFilePath);
    console.log('Result:', JSON.stringify(readAfterPatchResult, null, 2));
    
    console.log('\n--- Test 6: Invalid/Dangerous command (Sandbox Policy violation) ---');
    const dangerousCmdResult = await harness.runCommand('cat /etc/passwd');
    console.log('Result:', JSON.stringify(dangerousCmdResult, null, 2));

    console.log('\nCalling harness.shutdown()...');
    harness.shutdown?.();
    console.log('Verification Complete.');

  } catch (err: any) {
    console.error('Verification failed with error:', err);
    process.exit(1);
  }
}

main();
