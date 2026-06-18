# sa_floor_completed_wa

Template Type: WhatsApp text message  
Owner: Service Advisor workflow  
Version: v1

## Purpose

Notify customer that floor/service work is completed and provide a dynamic complaint URL for issue reporting.

## Variables

- customer_name
- reg_number
- vehicle_details
- completed_on
- complaint_url

## Message Template

Hello {customer_name},

Your vehicle {reg_number} ({vehicle_details}) work is completed on {completed_on}.

If you face any issue, please raise a complaint here:
{complaint_url}

Thank you,
Techwheels Service

## Validation Rules

- complaint_url is mandatory.
- reg_number is mandatory.
- completed_on should be human-readable date/time.
- vehicle_details should include at least model or service type.

## Example Render

Hello Rahul,

Your vehicle RJ60CA4669 (Punch Adventure Rhythm CNG - Paid Service) work is completed on 11 Jun 2026, 05:42 PM.

If you face any issue, please raise a complaint here:
https://techwheels-service.vercel.app/c/8f3a2e91

Thank you,
Techwheels Service
