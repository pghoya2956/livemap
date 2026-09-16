#!/usr/bin/env node
// npm bin 심링크로 불려도 실행되도록 판정 없이 main()을 부른다.
import { main } from '../src/cli.mjs';

const code = await main(process.argv.slice(2));
if (code !== undefined) process.exitCode = code;
