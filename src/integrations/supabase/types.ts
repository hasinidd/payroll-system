export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          branch_id: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          branch_id: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          branch_id?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_accounts: {
        Row: {
          created_at: string
          created_by: string
          display_name: string
          email: string
          feature_flags: Json
          id: string
          is_active: boolean
          max_branches: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          display_name?: string
          email: string
          feature_flags?: Json
          id?: string
          is_active?: boolean
          max_branches?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          display_name?: string
          email?: string
          feature_flags?: Json
          id?: string
          is_active?: boolean
          max_branches?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          branch_id: string
          created_at: string
          date: string
          employee_id: string
          id: string
          in_time: string | null
          is_flagged: boolean
          late_minutes: number
          ot_hours: number
          ot_multiplier: number
          out_time: string | null
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          branch_id?: string
          created_at?: string
          date: string
          employee_id: string
          id?: string
          in_time?: string | null
          is_flagged?: boolean
          late_minutes?: number
          ot_hours?: number
          ot_multiplier?: number
          out_time?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          branch_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          in_time?: string | null
          is_flagged?: boolean
          late_minutes?: number
          ot_hours?: number
          ot_multiplier?: number
          out_time?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_admins: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_admins_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_report_templates: {
        Row: {
          branch_id: string
          created_at: string
          file_name: string
          file_path: string
          file_type: string
          id: string
          report_type: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_type?: string
          id?: string
          report_type: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          report_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_report_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address_line1: string
          address_line2: string
          branch_id: string
          company_name: string
          epf_enabled: boolean
          epf_reg_no: string
          etf_enabled: boolean
          holiday_multiplier: number
          id: string
          late_deduction_enabled: boolean
          ot_default_multiplier: number
          ot_enabled: boolean
          ot_hours_divisor: number
          phone: string
          report_footer: string
          shift_start_time: string
          updated_at: string
        }
        Insert: {
          address_line1?: string
          address_line2?: string
          branch_id?: string
          company_name?: string
          epf_enabled?: boolean
          epf_reg_no?: string
          etf_enabled?: boolean
          holiday_multiplier?: number
          id?: string
          late_deduction_enabled?: boolean
          ot_default_multiplier?: number
          ot_enabled?: boolean
          ot_hours_divisor?: number
          phone?: string
          report_footer?: string
          shift_start_time?: string
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string
          branch_id?: string
          company_name?: string
          epf_enabled?: boolean
          epf_reg_no?: string
          etf_enabled?: boolean
          holiday_multiplier?: number
          id?: string
          late_deduction_enabled?: boolean
          ot_default_multiplier?: number
          ot_enabled?: boolean
          ot_hours_divisor?: number
          phone?: string
          report_footer?: string
          shift_start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          branch_id?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      device_log_import_jobs: {
        Row: {
          created_at: string
          error: string | null
          file_name: string | null
          id: string
          result: Json | null
          shift_start_time: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          file_name?: string | null
          id?: string
          result?: Json | null
          shift_start_time?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          file_name?: string | null
          id?: string
          result?: Json | null
          shift_start_time?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          branch_id: string
          employee_id: string
          file_name: string
          file_path: string
          id: string
          uploaded_at: string
        }
        Insert: {
          branch_id?: string
          employee_id: string
          file_name: string
          file_path: string
          id?: string
          uploaded_at?: string
        }
        Update: {
          branch_id?: string
          employee_id?: string
          file_name?: string
          file_path?: string
          id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_deductions: {
        Row: {
          branch_id: string
          created_at: string
          deduction_type: Database["public"]["Enums"]["deduction_type"]
          description: string | null
          employee_id: string
          id: string
          installments: number
          interest_rate: number
          is_active: boolean
          is_recurring: boolean
          monthly_deduction: number
          remaining_balance: number
          total_amount: number
          updated_at: string
          with_interest: boolean
        }
        Insert: {
          branch_id?: string
          created_at?: string
          deduction_type: Database["public"]["Enums"]["deduction_type"]
          description?: string | null
          employee_id: string
          id?: string
          installments?: number
          interest_rate?: number
          is_active?: boolean
          is_recurring?: boolean
          monthly_deduction?: number
          remaining_balance?: number
          total_amount?: number
          updated_at?: string
          with_interest?: boolean
        }
        Update: {
          branch_id?: string
          created_at?: string
          deduction_type?: Database["public"]["Enums"]["deduction_type"]
          description?: string | null
          employee_id?: string
          id?: string
          installments?: number
          interest_rate?: number
          is_active?: boolean
          is_recurring?: boolean
          monthly_deduction?: number
          remaining_balance?: number
          total_amount?: number
          updated_at?: string
          with_interest?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_deductions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          attendance_allowance: number
          bank_account_no: string | null
          bank_branch: string | null
          bank_code: string | null
          bank_name: string | null
          basic_salary: number
          biometric_id: string | null
          branch_code: string | null
          branch_id: string
          category: Database["public"]["Enums"]["employee_category"]
          contact_no: string | null
          created_at: string
          department_id: string | null
          deposits: number
          designation: string
          email: string | null
          employee_no: string
          epf_no: string
          first_name: string
          fuel_allowance: number
          id: string
          join_date: string
          last_name: string
          nic_number: string
          other_deduction_reason: string | null
          other_deductions: number
          recoveries: number
          salary_advance: number
          status: Database["public"]["Enums"]["employee_status"]
          status_remark: string | null
          termination_date: string | null
          travel_allowance: number
          updated_at: string
          welfare: number
        }
        Insert: {
          address?: string | null
          attendance_allowance?: number
          bank_account_no?: string | null
          bank_branch?: string | null
          bank_code?: string | null
          bank_name?: string | null
          basic_salary?: number
          biometric_id?: string | null
          branch_code?: string | null
          branch_id?: string
          category?: Database["public"]["Enums"]["employee_category"]
          contact_no?: string | null
          created_at?: string
          department_id?: string | null
          deposits?: number
          designation?: string
          email?: string | null
          employee_no: string
          epf_no: string
          first_name: string
          fuel_allowance?: number
          id?: string
          join_date: string
          last_name: string
          nic_number: string
          other_deduction_reason?: string | null
          other_deductions?: number
          recoveries?: number
          salary_advance?: number
          status?: Database["public"]["Enums"]["employee_status"]
          status_remark?: string | null
          termination_date?: string | null
          travel_allowance?: number
          updated_at?: string
          welfare?: number
        }
        Update: {
          address?: string | null
          attendance_allowance?: number
          bank_account_no?: string | null
          bank_branch?: string | null
          bank_code?: string | null
          bank_name?: string | null
          basic_salary?: number
          biometric_id?: string | null
          branch_code?: string | null
          branch_id?: string
          category?: Database["public"]["Enums"]["employee_category"]
          contact_no?: string | null
          created_at?: string
          department_id?: string | null
          deposits?: number
          designation?: string
          email?: string | null
          employee_no?: string
          epf_no?: string
          first_name?: string
          fuel_allowance?: number
          id?: string
          join_date?: string
          last_name?: string
          nic_number?: string
          other_deduction_reason?: string | null
          other_deductions?: number
          recoveries?: number
          salary_advance?: number
          status?: Database["public"]["Enums"]["employee_status"]
          status_remark?: string | null
          termination_date?: string | null
          travel_allowance?: number
          updated_at?: string
          welfare?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          branch_id: string
          created_at: string
          date: string
          id: string
          name: string
          ot_multiplier: number
        }
        Insert: {
          branch_id?: string
          created_at?: string
          date: string
          id?: string
          name: string
          ot_multiplier?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          date?: string
          id?: string
          name?: string
          ot_multiplier?: number
        }
        Relationships: [
          {
            foreignKeyName: "holidays_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          annual: number
          branch_id: string
          casual: number
          created_at: string
          employee_id: string
          id: string
          maternity: number
          other: number
          sick: number
          year: number
        }
        Insert: {
          annual?: number
          branch_id?: string
          casual?: number
          created_at?: string
          employee_id: string
          id?: string
          maternity?: number
          other?: number
          sick?: number
          year: number
        }
        Update: {
          annual?: number
          branch_id?: string
          casual?: number
          created_at?: string
          employee_id?: string
          id?: string
          maternity?: number
          other?: number
          sick?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          branch_id: string
          created_at: string
          days: number
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
        }
        Insert: {
          branch_id?: string
          created_at?: string
          days: number
          employee_id: string
          end_date: string
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
        }
        Update: {
          branch_id?: string
          created_at?: string
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          branch_id: string
          created_at: string
          employee_id: string
          id: string
          installments: number
          interest_rate: number
          is_active: boolean
          loan_amount: number
          monthly_deduction: number
          remaining_balance: number
          updated_at: string
          with_interest: boolean
        }
        Insert: {
          branch_id?: string
          created_at?: string
          employee_id: string
          id?: string
          installments: number
          interest_rate?: number
          is_active?: boolean
          loan_amount: number
          monthly_deduction?: number
          remaining_balance?: number
          updated_at?: string
          with_interest?: boolean
        }
        Update: {
          branch_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          installments?: number
          interest_rate?: number
          is_active?: boolean
          loan_amount?: number
          monthly_deduction?: number
          remaining_balance?: number
          updated_at?: string
          with_interest?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "loans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_ot_adjustments: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          include_epf: boolean
          include_etf: boolean
          include_ot: boolean
          month: number
          note: string | null
          ot_hours: number
          ot_multiplier: number
          updated_at: string
          year: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          include_epf?: boolean
          include_etf?: boolean
          include_ot?: boolean
          month: number
          note?: string | null
          ot_hours?: number
          ot_multiplier?: number
          updated_at?: string
          year: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          include_epf?: boolean
          include_etf?: boolean
          include_ot?: boolean
          month?: number
          note?: string | null
          ot_hours?: number
          ot_multiplier?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_ot_adjustments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_ot_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          attendance_allowance: number
          attendance_days: number
          basic_salary: number
          bonus: number
          branch_id: string
          created_at: string
          deposits: number
          employee_id: string
          epf_employee: number
          epf_employer: number
          epf_salary: number
          etf_employer: number
          extra_pay: number
          fuel_allowance: number
          gross_salary: number
          id: string
          incentives: number
          late_minutes: number
          late_pay_deduction: number
          loan_deduction: number
          net_salary: number
          no_pay_days: number
          no_pay_deduction: number
          ot_pay: number
          other_allowances: number
          other_deduction_reason: string | null
          other_deductions: number
          payroll_period_id: string
          recoveries: number
          salary_advance: number
          total_deductions: number
          total_earnings: number
          travel_allowance: number
          welfare: number
        }
        Insert: {
          attendance_allowance?: number
          attendance_days?: number
          basic_salary?: number
          bonus?: number
          branch_id?: string
          created_at?: string
          deposits?: number
          employee_id: string
          epf_employee?: number
          epf_employer?: number
          epf_salary?: number
          etf_employer?: number
          extra_pay?: number
          fuel_allowance?: number
          gross_salary?: number
          id?: string
          incentives?: number
          late_minutes?: number
          late_pay_deduction?: number
          loan_deduction?: number
          net_salary?: number
          no_pay_days?: number
          no_pay_deduction?: number
          ot_pay?: number
          other_allowances?: number
          other_deduction_reason?: string | null
          other_deductions?: number
          payroll_period_id: string
          recoveries?: number
          salary_advance?: number
          total_deductions?: number
          total_earnings?: number
          travel_allowance?: number
          welfare?: number
        }
        Update: {
          attendance_allowance?: number
          attendance_days?: number
          basic_salary?: number
          bonus?: number
          branch_id?: string
          created_at?: string
          deposits?: number
          employee_id?: string
          epf_employee?: number
          epf_employer?: number
          epf_salary?: number
          etf_employer?: number
          extra_pay?: number
          fuel_allowance?: number
          gross_salary?: number
          id?: string
          incentives?: number
          late_minutes?: number
          late_pay_deduction?: number
          loan_deduction?: number
          net_salary?: number
          no_pay_days?: number
          no_pay_deduction?: number
          ot_pay?: number
          other_allowances?: number
          other_deduction_reason?: string | null
          other_deductions?: number
          payroll_period_id?: string
          recoveries?: number
          salary_advance?: number
          total_deductions?: number
          total_earnings?: number
          travel_allowance?: number
          welfare?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          branch_id: string
          created_at: string
          days_in_month: number
          id: string
          is_locked: boolean
          lock_reason: string | null
          locked_by: string | null
          month: number
          required_days: number
          year: number
        }
        Insert: {
          branch_id?: string
          created_at?: string
          days_in_month: number
          id?: string
          is_locked?: boolean
          lock_reason?: string | null
          locked_by?: string | null
          month: number
          required_days: number
          year: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          days_in_month?: number
          id?: string
          is_locked?: boolean
          lock_reason?: string | null
          locked_by?: string | null
          month?: number
          required_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_payroll_settings: { Args: never; Returns: boolean }
      get_owned_branch_ids: { Args: never; Returns: string[] }
      get_user_branch_ids: { Args: never; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      is_ultra_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "super_admin"
        | "ultra_admin"
        | "hr"
        | "accountant"
      attendance_status: "Present" | "Leave" | "No Pay" | "Half Day"
      deduction_type:
        | "Welfare"
        | "Salary Advance"
        | "Recovery"
        | "Deposit"
        | "Other"
        | "Loan"
      employee_category: "Management" | "Office"
      employee_status: "Active" | "Terminated" | "Promoted"
      leave_status: "Pending" | "Approved" | "Rejected"
      leave_type: "Annual" | "Casual" | "Sick" | "Other" | "Maternity"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "user",
        "super_admin",
        "ultra_admin",
        "hr",
        "accountant",
      ],
      attendance_status: ["Present", "Leave", "No Pay", "Half Day"],
      deduction_type: [
        "Welfare",
        "Salary Advance",
        "Recovery",
        "Deposit",
        "Other",
        "Loan",
      ],
      employee_category: ["Management", "Office"],
      employee_status: ["Active", "Terminated", "Promoted"],
      leave_status: ["Pending", "Approved", "Rejected"],
      leave_type: ["Annual", "Casual", "Sick", "Other", "Maternity"],
    },
  },
} as const
