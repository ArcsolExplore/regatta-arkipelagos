"""Minimal stand-in for the `brotli` Python module, using Node's zlib (for fontTools WOFF2 output).
Only what fontTools needs: compress/decompress and the MODE_* constants."""
import subprocess

MODE_GENERIC, MODE_TEXT, MODE_FONT = 0, 1, 2
_JS = ("const z=require('zlib');let c=[];process.stdin.on('data',d=>c.push(d)).on('end',()=>{const b=Buffer.concat(c);"
       "process.stdout.write(process.argv[1]==='c'?z.brotliCompressSync(b,{params:{[z.constants.BROTLI_PARAM_MODE]:+process.argv[2],"
       "[z.constants.BROTLI_PARAM_QUALITY]:+process.argv[3],[z.constants.BROTLI_PARAM_LGWIN]:+process.argv[4]}}):z.brotliDecompressSync(b));});")

def compress(data, mode=MODE_GENERIC, quality=11, lgwin=22, lgblock=0):
    return subprocess.run(['node', '-e', _JS, 'c', str(mode), str(quality), str(lgwin)], input=bytes(data), capture_output=True, check=True).stdout

def decompress(data):
    return subprocess.run(['node', '-e', _JS, 'd'], input=bytes(data), capture_output=True, check=True).stdout

class error(Exception):
    pass
