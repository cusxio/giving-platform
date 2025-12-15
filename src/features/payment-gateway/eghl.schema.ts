import { Type } from 'typebox'
import type { Static } from 'typebox'
import { Compile } from 'typebox/compile'

// Success
// {
//   TransactionType: 'SALE',
//   PymtMethod: 'DD',
//   ServiceID: 'CIV',
//   PaymentID: '5QUfrP54nGKSUW65RXqe',
//   OrderNumber: '5QUfrP54nGKSUW65RXqe',
//   Amount: '30.00',
//   CurrencyCode: 'MYR',
//   HashValue: '6b4ed6b6c6b78173ca752bdf85b915f8495920a5ba55bddd9ca4c4d43efe9ba3',
//   HashValue2: 'c3645a93c3cafb39770fc970fb8f286a03de99588452fb8080bda100e1510ff5',
//   TxnID: 'CIV5QUfrP54nGKSUW65RXqe',
//   Acquirer: 'HostSim',
//   IssuingBank: 'HostSim',
//   TxnStatus: '0',
//   TxnMessage: 'Transaction Successful',
//   AuthCode: 'CIV5QU',
//   BankRefNo: 'CIV5QUfrP54nGKSUW65RXqe',
//   Param6: 'user',
//   RespTime: '2023-08-19 22:46:52'
// }
//
// Cancelled
// {
//   Amount: '10.00',
//   CurrencyCode: 'MYR',
//   HashValue: 'c169ea6bd49d1aad32f7abdfad48ad5a0bbb42b383e7fa50be315f1a602d568e',
//   HashValue2: 'afae00a1e575f2f6b358f13fec6e7ccf057c83eed544962d804ea123cf2c6cfd',
//   OrderNumber: '3x2IEtFnpIlgcAB4ezTQ',
//   Param6: 'user',
//   Param7: '',
//   PaymentID: '3x2IEtFnpIlgcAB4ezTQ',
//   PymtMethod: 'ANY',
//   ServiceID: 'CIV',
//   TransactionType: 'SALE',
//   TxnID: '',
//   TxnMessage: 'Buyer cancelled',
//   TxnStatus: '1'
// }
//
// Failed
// {
// TransactionType: 'SALE',
//   PymtMethod: 'DD',
//   ServiceID: 'CIV',
//   PaymentID: 'hVbBzd7AJuxkRpO1eSgh',
//   OrderNumber: 'hVbBzd7AJuxkRpO1eSgh',
//   Amount: '0.14',
//   CurrencyCode: 'MYR',
//   HashValue: 'b374e2425accaa6471c226b03b4d8dcdc791f74ee30405d1e8701d80982a87eb',
//   HashValue2: '040afdedff0932648bf47ac36b45b38bec9509c4ad9f46ddbb579f8ee4c56824',
//   TxnID: 'CIVhVbBzd7AJuxkRpO1eSgh',
//   Acquirer: 'HostSim',
//   IssuingBank: 'HostSim',
//   TxnStatus: '1',
//   TxnMessage: 'Transaction Failed',
//   AuthCode: '',
//   BankRefNo: 'CIVhVbBzd7AJuxkRpO1eSgh',
//   Param6: 'user',
//   RespTime: '2023-08-24 20:02:33'
// }
//
// Duplicate PaymentID (happens when eGHL payment page is refreshsed)
// {
//   Amount: '10.00',
//   CurrencyCode: 'MYR',
//   HashValue: 'd11b4249bc34fc707818500e1074db3dec33dded61b4b3ad17aa6d9f89c95a3a',
//   HashValue2: 'e6da2de01d40a124134c0d008c85709989fccf0050ad860aced30eeeeb6b63c1',
//   OrderNumber: '5vywswK1tLo0fO69FaX0',
//   Param6: 'user',
//   Param7: '',
//   PaymentID: '5vywswK1tLo0fO69FaX0',
//   PymtMethod: 'ANY',
//   ServiceID: 'CIV',
//   TransactionType: 'SALE',
//   TxnID: '',
//   TxnMessage: 'Duplicate Payment ID',
//   TxnStatus: '1'
// }

export enum EghlTxnStatus {
  Failed = '1',
  Pending = '2',
  Success = '0',
}

export const EghlPaymentResponseSchema = Compile(
  Type.Object({
    TransactionType: Type.String(),
    PymtMethod: Type.String(),
    ServiceID: Type.String(),
    PaymentID: Type.String({ minLength: 1 }),
    OrderNumber: Type.String(),
    Amount: Type.String({
      pattern: String.raw`^\d+\.\d{2}$`,
      description: 'Payment amount in major currency unit, e.g., 123.00',
    }),
    CurrencyCode: Type.String({ minLength: 3, maxLength: 3 }),
    HashValue: Type.String({ minLength: 1 }),
    HashValue2: Type.String({ minLength: 1 }),
    TxnID: Type.String(), // eGHL's ID, can be empty on failure/cancellation
    TxnStatus: Type.Enum(EghlTxnStatus),
    TxnMessage: Type.String(),

    Param6: Type.Optional(Type.String()),
    Param7: Type.Optional(Type.String()),

    AuthCode: Type.Optional(Type.String()),
    IssuingBank: Type.Optional(Type.String()),
    BankRefNo: Type.Optional(Type.String()),
    RespTime: Type.Optional(
      Type.String({
        description: "Response timestamp, e.g., 'YYYYMMDDHHMMSS'",
      }),
    ),

    // OCP Fields
    Token: Type.Optional(Type.String()),
    TokenType: Type.Optional(Type.String()),
    CardNoMask: Type.Optional(Type.String()),
    CardExp: Type.Optional(Type.String()),
    CardType: Type.Optional(Type.String()),
    CardHolder: Type.Optional(Type.String()),
  }),
)

export type EghlPaymentResponse = Static<typeof EghlPaymentResponseSchema>
