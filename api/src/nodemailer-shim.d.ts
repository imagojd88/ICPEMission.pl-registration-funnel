// Ambientowy shim — pozwala typecheckować dynamiczny import('nodemailer')
// bez instalacji @types/nodemailer (runtime instaluje sam pakiet na Render).
declare module 'nodemailer';
