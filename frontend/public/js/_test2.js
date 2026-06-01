
console.log('typeof module:', typeof module);
console.log('typeof module.exports:', typeof module.exports);
console.log('module.exports keys:', Object.keys(module.exports));
module.exports = { hello: 'world' };
console.log('AFTER assign - module.exports:', JSON.stringify(module.exports));
