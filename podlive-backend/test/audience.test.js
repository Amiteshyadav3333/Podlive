const test = require('node:test');
const assert = require('node:assert/strict');
const { getAgeGroup } = require('../src/services/audience.service');

const now = new Date('2026-08-28T12:00:00.000Z');

test('audience age groups use the viewer birthday boundary', () => {
    assert.equal(getAgeGroup('2008-08-28', now), '18_24');
    assert.equal(getAgeGroup('2008-08-29', now), '13_17');
    assert.equal(getAgeGroup('1991-08-28', now), '35_44');
    assert.equal(getAgeGroup('1961-08-28', now), '65_plus');
});

test('audience age grouping ignores missing, invalid, and future dates', () => {
    assert.equal(getAgeGroup(null, now), null);
    assert.equal(getAgeGroup('not-a-date', now), null);
    assert.equal(getAgeGroup('2027-01-01', now), null);
});
