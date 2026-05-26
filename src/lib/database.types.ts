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
      documents: {
        Row: {
          created_at: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          drive_file_id: string | null
          drive_url: string | null
          file_size_mb: number | null
          id: string
          job_card_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          drive_file_id?: string | null
          drive_url?: string | null
          file_size_mb?: number | null
          id?: string
          job_card_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          drive_file_id?: string | null
          drive_url?: string | null
          file_size_mb?: number | null
          id?: string
          job_card_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "documents_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_master: {
        Row: {
          created_at: string
          department: string | null
          employee_code: string
          employee_name: string
          fuel_type: string | null
          id: number
          location: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          employee_code: string
          employee_name: string
          fuel_type?: string | null
          id?: never
          location?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          employee_code?: string
          employee_name?: string
          fuel_type?: string | null
          id?: never
          location?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      estimate_rows: {
        Row: {
          action: string | null
          created_at: string
          cut_weld_charges: number
          defect: string | null
          id: string
          job_card_id: string
          job_code: string | null
          job_code_desc: string | null
          labour_charges: number
          ndp_value: number
          no_off: number
          paint_charges: number
          panel_name: string | null
          part_description: string | null
          part_number: string | null
          qty: number
          row_total: number | null
          sr_no: number
          total_special_charges: number
        }
        Insert: {
          action?: string | null
          created_at?: string
          cut_weld_charges?: number
          defect?: string | null
          id?: string
          job_card_id: string
          job_code?: string | null
          job_code_desc?: string | null
          labour_charges?: number
          ndp_value?: number
          no_off?: number
          paint_charges?: number
          panel_name?: string | null
          part_description?: string | null
          part_number?: string | null
          qty?: number
          row_total?: number | null
          sr_no: number
          total_special_charges?: number
        }
        Update: {
          action?: string | null
          created_at?: string
          cut_weld_charges?: number
          defect?: string | null
          id?: string
          job_card_id?: string
          job_code?: string | null
          job_code_desc?: string | null
          labour_charges?: number
          ndp_value?: number
          no_off?: number
          paint_charges?: number
          panel_name?: string | null
          part_description?: string | null
          part_number?: string | null
          qty?: number
          row_total?: number | null
          sr_no?: number
          total_special_charges?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_rows_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "estimate_rows_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      import_employee_mapping_issues: {
        Row: {
          branch: string
          created_at: string
          id: number
          job_card_number: string | null
          reason: string
          resolved_employee_code: string | null
          row_number: number | null
          source_table: string
          sr_assigned_to: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch: string
          created_at?: string
          id?: never
          job_card_number?: string | null
          reason: string
          resolved_employee_code?: string | null
          row_number?: number | null
          source_table: string
          sr_assigned_to?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch?: string
          created_at?: string
          id?: never
          job_card_number?: string | null
          reason?: string
          resolved_employee_code?: string | null
          row_number?: number | null
          source_table?: string
          sr_assigned_to?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_mapping_issue_employee_code"
            columns: ["resolved_employee_code"]
            isOneToOne: false
            referencedRelation: "employee_master"
            referencedColumns: ["employee_code"]
          },
        ]
      }
      import_metadata: {
        Row: {
          id: number
          last_updated_at: string | null
          table_name: string
        }
        Insert: {
          id?: never
          last_updated_at?: string | null
          table_name: string
        }
        Update: {
          id?: never
          last_updated_at?: string | null
          table_name?: string
        }
        Relationships: []
      }
      job_card_closed_data: {
        Row: {
          account_phone_number: string | null
          branch: string
          chassis_number: string | null
          closed_date_time: string | null
          created_at: string
          created_date_time: string | null
          employee_code: string | null
          final_labour_amount: number | null
          final_spares_amount: number | null
          first_name: string | null
          id: number
          Invoice_date: string | null
          job_card_number: string | null
          kms_run: number | null
          last_name: string | null
          last_service_date: string | null
          last_service_km: number | null
          lubs_revenue: number | null
          parent_product_line: string | null
          product_line: string | null
          sr_assigned_to: string | null
          sr_type: string | null
          total_invoice_amount: number | null
          updated_at: string
          vehicle_registration_number: string | null
          vehicle_sale_date: string | null
        }
        Insert: {
          account_phone_number?: string | null
          branch: string
          chassis_number?: string | null
          closed_date_time?: string | null
          created_at?: string
          created_date_time?: string | null
          employee_code?: string | null
          final_labour_amount?: number | null
          final_spares_amount?: number | null
          first_name?: string | null
          id?: never
          Invoice_date?: string | null
          job_card_number?: string | null
          kms_run?: number | null
          last_name?: string | null
          last_service_date?: string | null
          last_service_km?: number | null
          lubs_revenue?: number | null
          parent_product_line?: string | null
          product_line?: string | null
          sr_assigned_to?: string | null
          sr_type?: string | null
          total_invoice_amount?: number | null
          updated_at?: string
          vehicle_registration_number?: string | null
          vehicle_sale_date?: string | null
        }
        Update: {
          account_phone_number?: string | null
          branch?: string
          chassis_number?: string | null
          closed_date_time?: string | null
          created_at?: string
          created_date_time?: string | null
          employee_code?: string | null
          final_labour_amount?: number | null
          final_spares_amount?: number | null
          first_name?: string | null
          id?: never
          Invoice_date?: string | null
          job_card_number?: string | null
          kms_run?: number | null
          last_name?: string | null
          last_service_date?: string | null
          last_service_km?: number | null
          lubs_revenue?: number | null
          parent_product_line?: string | null
          product_line?: string | null
          sr_assigned_to?: string | null
          sr_type?: string | null
          total_invoice_amount?: number | null
          updated_at?: string
          vehicle_registration_number?: string | null
          vehicle_sale_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_jc_closed_employee_code"
            columns: ["employee_code"]
            isOneToOne: false
            referencedRelation: "employee_master"
            referencedColumns: ["employee_code"]
          },
        ]
      }
      job_cards: {
        Row: {
          claim_type: string | null
          complaint_date: string
          complaint_text: string | null
          created_at: string
          id: string
          jc_number: string
          km_reading: number | null
          reg_number: string
          status: Database["public"]["Enums"]["job_card_status"]
          updated_at: string
        }
        Insert: {
          claim_type?: string | null
          complaint_date: string
          complaint_text?: string | null
          created_at?: string
          id?: string
          jc_number: string
          km_reading?: number | null
          reg_number: string
          status?: Database["public"]["Enums"]["job_card_status"]
          updated_at?: string
        }
        Update: {
          claim_type?: string | null
          complaint_date?: string
          complaint_text?: string | null
          created_at?: string
          id?: string
          jc_number?: string
          km_reading?: number | null
          reg_number?: string
          status?: Database["public"]["Enums"]["job_card_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_cards_reg_number_fkey"
            columns: ["reg_number"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["reg_number"]
          },
          {
            foreignKeyName: "job_cards_reg_number_fkey"
            columns: ["reg_number"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["reg_number"]
          },
        ]
      }
      modules: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: number
          is_active: boolean | null
          label: string
          name: string
          route: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: number
          is_active?: boolean | null
          label: string
          name: string
          route?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: number
          is_active?: boolean | null
          label?: string
          name?: string
          route?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      panel_photos: {
        Row: {
          captured_at: string | null
          created_at: string
          drive_file_id: string | null
          drive_url: string | null
          gps_city: string | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          job_card_id: string
          panel_id: string
          photo_type: Database["public"]["Enums"]["photo_type"]
          storage_path: string
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_url?: string | null
          gps_city?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          job_card_id: string
          panel_id: string
          photo_type: Database["public"]["Enums"]["photo_type"]
          storage_path: string
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_url?: string | null
          gps_city?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          job_card_id?: string
          panel_id?: string
          photo_type?: Database["public"]["Enums"]["photo_type"]
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "panel_photos_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "panel_photos_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_photos_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "panels"
            referencedColumns: ["id"]
          },
        ]
      }
      panels: {
        Row: {
          action: Database["public"]["Enums"]["panel_action"]
          created_at: string
          id: string
          job_card_id: string
          panel_name: string
          technician_remarks: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["panel_action"]
          created_at?: string
          id?: string
          job_card_id: string
          panel_name: string
          technician_remarks?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["panel_action"]
          created_at?: string
          id?: string
          job_card_id?: string
          panel_name?: string
          technician_remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "panels_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_card_summary"
            referencedColumns: ["job_card_id"]
          },
          {
            foreignKeyName: "panels_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      part_master: {
        Row: {
          category: string | null
          created_at: string
          hsn_code: string | null
          part_description: string | null
          part_number: string
          tm_part_indicator: string | null
          uom: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          hsn_code?: string | null
          part_description?: string | null
          part_number: string
          tm_part_indicator?: string | null
          uom?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          hsn_code?: string | null
          part_description?: string | null
          part_number?: string
          tm_part_indicator?: string | null
          uom?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      service_invoice_data: {
        Row: {
          bill_to_first_name: string | null
          bill_to_last_name: string | null
          branch: string | null
          chassis_number: string | null
          created_at: string
          discounts_labour: number | null
          discounts_parts: number | null
          final_consolidated_invoice_amount: number | null
          final_labour_invoice_amount: number | null
          final_spares_invoice_amount: number | null
          final_tcs_amount: number | null
          id: number
          invoice_date: string | null
          invoice_number: string | null
          order_number: string | null
          other_charges_labour: number | null
          other_charges_parts: number | null
          sr_number: string | null
          updated_at: string
          vrn: string | null
        }
        Insert: {
          bill_to_first_name?: string | null
          bill_to_last_name?: string | null
          branch?: string | null
          chassis_number?: string | null
          created_at?: string
          discounts_labour?: number | null
          discounts_parts?: number | null
          final_consolidated_invoice_amount?: number | null
          final_labour_invoice_amount?: number | null
          final_spares_invoice_amount?: number | null
          final_tcs_amount?: number | null
          id?: never
          invoice_date?: string | null
          invoice_number?: string | null
          order_number?: string | null
          other_charges_labour?: number | null
          other_charges_parts?: number | null
          sr_number?: string | null
          updated_at?: string
          vrn?: string | null
        }
        Update: {
          bill_to_first_name?: string | null
          bill_to_last_name?: string | null
          branch?: string | null
          chassis_number?: string | null
          created_at?: string
          discounts_labour?: number | null
          discounts_parts?: number | null
          final_consolidated_invoice_amount?: number | null
          final_labour_invoice_amount?: number | null
          final_spares_invoice_amount?: number | null
          final_tcs_amount?: number | null
          id?: never
          invoice_date?: string | null
          invoice_number?: string | null
          order_number?: string | null
          other_charges_labour?: number | null
          other_charges_parts?: number | null
          sr_number?: string | null
          updated_at?: string
          vrn?: string | null
        }
        Relationships: []
      }
      service_jc_parts_data: {
        Row: {
          branch: string | null
          created_at: string
          id: number
          jc_number: string | null
          service_record: string | null
          updated_at: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          id?: never
          jc_number?: string | null
          service_record?: string | null
          updated_at?: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          id?: never
          jc_number?: string | null
          service_record?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_parts_consumption_data: {
        Row: {
          branch: string
          created_at: string
          fiscal_month: number | null
          fiscal_year: number
          id: number
          month_name: string
          otc_quantity: number
          part_description: string | null
          part_number: string
          portal: string | null
          quantity_consumed: number
          source_reference: string | null
          source_row_hash: string
          total_consumption: number | null
          total_cost: number | null
          transaction_date: string | null
          unit_cost: number | null
          updated_at: string
          ws_quantity: number
        }
        Insert: {
          branch: string
          created_at?: string
          fiscal_month?: number | null
          fiscal_year: number
          id?: never
          month_name: string
          otc_quantity?: number
          part_description?: string | null
          part_number: string
          portal?: string | null
          quantity_consumed?: number
          source_reference?: string | null
          source_row_hash: string
          total_consumption?: number | null
          total_cost?: number | null
          transaction_date?: string | null
          unit_cost?: number | null
          updated_at?: string
          ws_quantity?: number
        }
        Update: {
          branch?: string
          created_at?: string
          fiscal_month?: number | null
          fiscal_year?: number
          id?: never
          month_name?: string
          otc_quantity?: number
          part_description?: string | null
          part_number?: string
          portal?: string | null
          quantity_consumed?: number
          source_reference?: string | null
          source_row_hash?: string
          total_consumption?: number | null
          total_cost?: number | null
          transaction_date?: string | null
          unit_cost?: number | null
          updated_at?: string
          ws_quantity?: number
        }
        Relationships: []
      }
      service_parts_order_data: {
        Row: {
          backorder_quantity: number
          branch: string
          challan_date: string | null
          challan_no: string | null
          challan_qty: number | null
          confirmation_date: string | null
          confirmation_qty: number | null
          created_at: string
          crm_order_number: string | null
          dealer_code: string | null
          dealer_name: string | null
          div_id: string | null
          docket_number: string | null
          eta_1: string | null
          eta_2: string | null
          eta_3: string | null
          expected_date: string | null
          fiscal_month: number | null
          id: number
          intransit_qty: number | null
          invoice_date: string | null
          invoice_number: string | null
          invoice_qty: number | null
          order_date: string | null
          order_status: string | null
          ordered_quantity: number
          part_description: string | null
          part_number: string
          portal: string | null
          received_quantity: number
          sap_order_line_item: string | null
          sap_order_number: string | null
          source_document_id: string | null
          source_row_hash: string
          spares_order_type: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          backorder_quantity?: number
          branch: string
          challan_date?: string | null
          challan_no?: string | null
          challan_qty?: number | null
          confirmation_date?: string | null
          confirmation_qty?: number | null
          created_at?: string
          crm_order_number?: string | null
          dealer_code?: string | null
          dealer_name?: string | null
          div_id?: string | null
          docket_number?: string | null
          eta_1?: string | null
          eta_2?: string | null
          eta_3?: string | null
          expected_date?: string | null
          fiscal_month?: number | null
          id?: never
          intransit_qty?: number | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_qty?: number | null
          order_date?: string | null
          order_status?: string | null
          ordered_quantity?: number
          part_description?: string | null
          part_number: string
          portal?: string | null
          received_quantity?: number
          sap_order_line_item?: string | null
          sap_order_number?: string | null
          source_document_id?: string | null
          source_row_hash: string
          spares_order_type?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          backorder_quantity?: number
          branch?: string
          challan_date?: string | null
          challan_no?: string | null
          challan_qty?: number | null
          confirmation_date?: string | null
          confirmation_qty?: number | null
          created_at?: string
          crm_order_number?: string | null
          dealer_code?: string | null
          dealer_name?: string | null
          div_id?: string | null
          docket_number?: string | null
          eta_1?: string | null
          eta_2?: string | null
          eta_3?: string | null
          expected_date?: string | null
          fiscal_month?: number | null
          id?: never
          intransit_qty?: number | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_qty?: number | null
          order_date?: string | null
          order_status?: string | null
          ordered_quantity?: number
          part_description?: string | null
          part_number?: string
          portal?: string | null
          received_quantity?: number
          sap_order_line_item?: string | null
          sap_order_number?: string | null
          source_document_id?: string | null
          source_row_hash?: string
          spares_order_type?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_parts_stock_snapshot_data: {
        Row: {
          availability_status: string | null
          branch: string
          created_at: string
          fiscal_month: number | null
          id: number
          inventory_location: string | null
          inventory_value: number | null
          last_issue_date: string | null
          last_received_date: string | null
          location_1: string | null
          location_2: string | null
          location_3: string | null
          on_hand_quantity: number
          part_description: string | null
          part_number: string
          portal: string | null
          snapshot_date: string
          source_row_hash: string
          status: string | null
          total_price_value: number | null
          updated_at: string
          weighted_avg_cost: number | null
          weighted_cost: number | null
        }
        Insert: {
          availability_status?: string | null
          branch: string
          created_at?: string
          fiscal_month?: number | null
          id?: never
          inventory_location?: string | null
          inventory_value?: number | null
          last_issue_date?: string | null
          last_received_date?: string | null
          location_1?: string | null
          location_2?: string | null
          location_3?: string | null
          on_hand_quantity?: number
          part_description?: string | null
          part_number: string
          portal?: string | null
          snapshot_date: string
          source_row_hash: string
          status?: string | null
          total_price_value?: number | null
          updated_at?: string
          weighted_avg_cost?: number | null
          weighted_cost?: number | null
        }
        Update: {
          availability_status?: string | null
          branch?: string
          created_at?: string
          fiscal_month?: number | null
          id?: never
          inventory_location?: string | null
          inventory_value?: number | null
          last_issue_date?: string | null
          last_received_date?: string | null
          location_1?: string | null
          location_2?: string | null
          location_3?: string | null
          on_hand_quantity?: number
          part_description?: string | null
          part_number?: string
          portal?: string | null
          snapshot_date?: string
          source_row_hash?: string
          status?: string | null
          total_price_value?: number | null
          updated_at?: string
          weighted_avg_cost?: number | null
          weighted_cost?: number | null
        }
        Relationships: []
      }
      service_vas_jc_data: {
        Row: {
          billing_hours: number | null
          billing_type: string | null
          branch: string
          chassis_number: string | null
          complaint_code: string | null
          created_at: string
          discount: number | null
          employee_code: string | null
          id: number
          jc_closed_date_time: string | null
          job_card_number: string | null
          job_code: string | null
          job_description: string | null
          job_status: string | null
          job_value: number | null
          model: string | null
          net_price: number | null
          performed_by: string | null
          product_line: string | null
          rate_type: string | null
          sr_assigned_to: string | null
          sr_number: string | null
          sr_type: string | null
          updated_at: string
          vrn: string | null
        }
        Insert: {
          billing_hours?: number | null
          billing_type?: string | null
          branch: string
          chassis_number?: string | null
          complaint_code?: string | null
          created_at?: string
          discount?: number | null
          employee_code?: string | null
          id?: never
          jc_closed_date_time?: string | null
          job_card_number?: string | null
          job_code?: string | null
          job_description?: string | null
          job_status?: string | null
          job_value?: number | null
          model?: string | null
          net_price?: number | null
          performed_by?: string | null
          product_line?: string | null
          rate_type?: string | null
          sr_assigned_to?: string | null
          sr_number?: string | null
          sr_type?: string | null
          updated_at?: string
          vrn?: string | null
        }
        Update: {
          billing_hours?: number | null
          billing_type?: string | null
          branch?: string
          chassis_number?: string | null
          complaint_code?: string | null
          created_at?: string
          discount?: number | null
          employee_code?: string | null
          id?: never
          jc_closed_date_time?: string | null
          job_card_number?: string | null
          job_code?: string | null
          job_description?: string | null
          job_status?: string | null
          job_value?: number | null
          model?: string | null
          net_price?: number | null
          performed_by?: string | null
          product_line?: string | null
          rate_type?: string | null
          sr_assigned_to?: string | null
          sr_number?: string | null
          sr_type?: string | null
          updated_at?: string
          vrn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_service_vas_employee_code"
            columns: ["employee_code"]
            isOneToOne: false
            referencedRelation: "employee_master"
            referencedColumns: ["employee_code"]
          },
        ]
      }
      user_module_permissions: {
        Row: {
          can_delete: boolean | null
          can_modify: boolean | null
          can_view: boolean | null
          granted_at: string | null
          granted_by: string | null
          id: number
          module_id: number
          user_id: string
        }
        Insert: {
          can_delete?: boolean | null
          can_modify?: boolean | null
          can_view?: boolean | null
          granted_at?: string | null
          granted_by?: string | null
          id?: number
          module_id: number
          user_id: string
        }
        Update: {
          can_delete?: boolean | null
          can_modify?: boolean | null
          can_view?: boolean | null
          granted_at?: string | null
          granted_by?: string | null
          id?: number
          module_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_module_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_permissions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          branch: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          role: string
          updated_at: string | null
        }
        Insert: {
          branch?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          branch?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          bp_city_category: string | null
          colour: string | null
          created_at: string
          date_of_sale: string | null
          dealer_city: string | null
          dealer_code: string
          dealer_name: string | null
          model: string | null
          owner_name: string | null
          owner_phone: string | null
          paint_type: string | null
          reg_number: string
          vin: string | null
          year: number | null
        }
        Insert: {
          bp_city_category?: string | null
          colour?: string | null
          created_at?: string
          date_of_sale?: string | null
          dealer_city?: string | null
          dealer_code: string
          dealer_name?: string | null
          model?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          paint_type?: string | null
          reg_number: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          bp_city_category?: string | null
          colour?: string | null
          created_at?: string
          date_of_sale?: string | null
          dealer_city?: string | null
          dealer_code?: string
          dealer_name?: string | null
          model?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          paint_type?: string | null
          reg_number?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      job_card_summary: {
        Row: {
          bp_city_category: string | null
          claim_type: string | null
          colour: string | null
          complaint_date: string | null
          complaint_text: string | null
          date_of_sale: string | null
          dealer_city: string | null
          dealer_code: string | null
          dealer_name: string | null
          document_count: number | null
          estimate_row_count: number | null
          has_defect_photos: boolean | null
          has_excel_estimate: boolean | null
          has_paint_photos: boolean | null
          has_ppt_post: boolean | null
          has_ppt_pre: boolean | null
          has_primer_photos: boolean | null
          has_service_history: boolean | null
          has_video_delivery: boolean | null
          has_video_job_card: boolean | null
          jc_created_at: string | null
          jc_number: string | null
          jc_updated_at: string | null
          job_card_id: string | null
          km_reading: number | null
          model: string | null
          owner_name: string | null
          owner_phone: string | null
          paint_type: string | null
          panel_count: number | null
          photo_count: number | null
          reg_number: string | null
          status: Database["public"]["Enums"]["job_card_status"] | null
          tml_share_amount: number | null
          tml_share_percent: number | null
          total_estimate_amount: number | null
          vehicle_year: number | null
          vin: string | null
          warranty_age_days: number | null
        }
        Relationships: []
      }
      vw_parts_stock_health: {
        Row: {
          availability_status: string | null
          avg_4week_consumption: number | null
          branch: string | null
          days_of_supply: number | null
          intransit_qty: number | null
          inventory_location: string | null
          is_dead_stock: boolean | null
          last_issue_date: string | null
          location_1: string | null
          months_of_stock: number | null
          nearest_eta: string | null
          on_hand_quantity: number | null
          otc_total: number | null
          part_description: string | null
          part_number: string | null
          portal: string | null
          product_category: string | null
          status: string | null
          total_price_value: number | null
          vendor: string | null
          weeks_of_supply: number | null
          ws_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_all_my_permissions: {
        Args: never
        Returns: {
          can_delete: boolean
          can_modify: boolean
          can_view: boolean
          module_label: string
          module_name: string
          route: string
        }[]
      }
      get_my_permissions: {
        Args: { p_module: string }
        Returns: {
          can_delete: boolean
          can_modify: boolean
          can_view: boolean
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      my_dealer_code: { Args: never; Returns: string }
    }
    Enums: {
      doc_type:
        | "service_history"
        | "video_job_card"
        | "video_delivery"
        | "ppt_pre"
        | "ppt_post"
        | "excel_estimate"
      job_card_status:
        | "draft"
        | "submitted"
        | "approved"
        | "in_work"
        | "completed"
      panel_action: "repaint" | "replace"
      photo_type: "defect" | "primer" | "paint"
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
      doc_type: [
        "service_history",
        "video_job_card",
        "video_delivery",
        "ppt_pre",
        "ppt_post",
        "excel_estimate",
      ],
      job_card_status: [
        "draft",
        "submitted",
        "approved",
        "in_work",
        "completed",
      ],
      panel_action: ["repaint", "replace"],
      photo_type: ["defect", "primer", "paint"],
    },
  },
} as const
