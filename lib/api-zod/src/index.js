/**
 * Dev stub — replace with generated schemas from the full FurniCore `lib/api-zod` when available.
 * Uses `z.any()` so routes load; validation is not strict until you restore real Zod types.
 */
import { z } from "zod";

/** Loose object schema so `.merge()` / `.extend` used in routes still work (`z.any()` does not). */
const any = z.object({}).passthrough();

export const LoginBody = any;
export const RefreshTokenBody = any;
export const RegisterBody = any;

export const CreateTransactionBody = any;
export const ListTransactionsQueryParams = any;
export const GetTransactionParams = any;

export const CreateSupplierBody = any;
export const UpdateSupplierBody = any;
export const GetSupplierParams = any;
export const UpdateSupplierParams = any;
export const DeleteSupplierParams = any;
export const ListSuppliersQueryParams = any;
export const GetSupplierQuotesParams = any;

export const ListNotificationsQueryParams = any;
export const MarkNotificationReadParams = any;

export const CreateManufacturingTaskBody = any;
export const UpdateManufacturingTaskBody = any;
export const GetManufacturingTaskParams = any;
export const UpdateManufacturingTaskParams = any;
export const DeleteManufacturingTaskParams = any;
export const ListManufacturingTasksQueryParams = any;

export const CreateUserBody = any;
export const UpdateUserBody = any;
export const GetUserParams = any;
export const UpdateUserParams = any;
export const DeleteUserParams = any;
export const ListUsersQueryParams = any;

export const ListActivityLogsQueryParams = any;

export const CreateEmployeeBody = any;
export const UpdateEmployeeBody = any;
export const GetEmployeeParams = any;
export const UpdateEmployeeParams = any;
export const DeleteEmployeeParams = any;
export const ListEmployeesQueryParams = any;
export const GetEmployeeAttendanceParams = any;
export const RecordAttendanceBody = any;

export const GeneratePayrollBody = any;
export const ListPayrollQueryParams = any;
export const GetPayrollRecordParams = any;
export const UpdatePayrollRecordParams = any;
export const UpdatePayrollRecordBody = any;
export const ApprovePayrollParams = any;

export const CreateInventoryItemBody = any;
export const UpdateInventoryItemBody = any;
export const GetInventoryItemParams = any;
export const UpdateInventoryItemParams = any;
export const DeleteInventoryItemParams = any;
export const ListInventoryQueryParams = any;

export const UpdateProductBody = any;
export const GetProductParams = any;
export const UpdateProductParams = any;
export const DeleteProductParams = any;
export const GetProductCostingParams = any;

export const CreateQuoteBody = any;
export const ListQuotesQueryParams = any;
export const GetQuoteParams = any;
export const LockQuoteParams = any;
export const ApproveQuoteParams = any;
export const PayQuoteParams = any;
