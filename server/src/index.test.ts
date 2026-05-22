describe('Server Setup', () => {
  it('should have a working test environment', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have fast-check available', () => {
    const fc = require('fast-check');
    expect(fc).toBeDefined();
    expect(fc.assert).toBeDefined();
  });
});
