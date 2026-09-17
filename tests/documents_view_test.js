'use strict';

// Node unit tests for the DOM-independent helpers exported by documents.js.
// Run with: node tests/documents_view_test.js

const assert = require('assert');
const { escapeHtml, isViewableImage, attachmentSourceUrl } = require(
    '../public/src/features/documents/components/documents.js'
);

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log('  [PASS] ' + name);
        passed++;
    } catch (err) {
        console.log('  [FAIL] ' + name);
        console.log('         ' + err.message);
        failed++;
    }
}

console.log('\n=== Running Documents View (pure helpers) Tests ===\n');

test('escapeHtml escapes HTML-special characters', () => {
    const out = escapeHtml('<b>&"</b>');
    assert.ok(out.includes('&lt;b&gt;'), 'angle brackets escaped');
    assert.ok(out.includes('&amp;'), 'ampersand escaped');
    assert.ok(out.includes('&quot;'), 'double quote escaped');
});

test('escapeHtml handles null/undefined safely', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
});

test('isViewableImage accepts jpeg and png only', () => {
    assert.strictEqual(isViewableImage('image/jpeg'), true);
    assert.strictEqual(isViewableImage('image/png'), true);
    assert.strictEqual(isViewableImage('application/pdf'), false);
    assert.strictEqual(isViewableImage('image/gif'), false);
});

test('attachmentSourceUrl URL-encodes the attachment id', () => {
    assert.strictEqual(
        attachmentSourceUrl('abc-123'),
        'api.php?action=serve_attachment&id=abc-123'
    );
    assert.strictEqual(
        attachmentSourceUrl('weird id&x=1'),
        'api.php?action=serve_attachment&id=weird%20id%26x%3D1'
    );
});

console.log('\n=======================================================');
console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('=======================================================\n');

process.exit(failed > 0 ? 1 : 0);
