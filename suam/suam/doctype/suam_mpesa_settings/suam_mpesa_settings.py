# Copyright (c) 2025, Titansoft Limited and contributors
# For license information, please see license.txt

from frappe.model.document import Document
import frappe
import requests
from frappe import enqueue
from datetime import datetime
import base64

class SuamMpesaSettings(Document):
    @frappe.whitelist()
    def oauth(self):
        '''
        Function that uses the consumer key and consumer secret
        to generate and authorization token for a given MPesa app
        '''
        return self.gen_oauth()

    def gen_password(self):
        organization_shortcode = self.short_code
        # passkey = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"
        passkey = self.pass_key
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        password = base64.b64encode((organization_shortcode + passkey + timestamp).encode('ascii')).decode('utf-8') 
    
        return password, timestamp

    @frappe.whitelist()
    def gen_oauth(self):
        consumer_key = self.consumer_key
        consumer_secret = self.consumer_secret
        password = base64.b64encode((consumer_key + ":" + consumer_secret).encode('ascii')).decode('utf-8')
        headers = {
            'Authorization': 'Basic ' + password,
            'Content-type': 'application/json'
        }
    
        #send http request
        data = (requests.get(self.oauth_url, headers=headers )).json()

        return data['access_token']
    

    @frappe.whitelist()
    def register(self):
        '''
        Function that registers the validation and confirmation urls for an APP
        in MPesa
        '''
        organization_shortcode = self.mpesa_shortcode
        transaction_state = self.transaction_state
        base_url = self.callback_base_url
        
        headers = {
            'Authorization': 'Bearer ' + self.oauth(),
            'Content-type': 'application/json'
        }
  
        req_body = {
            "ShortCode":organization_shortcode,
            "ResponseType":transaction_state,
            "ConfirmationURL": base_url +"api/method/suam.utils.confirm",
            "ValidationURL": base_url +"api/method/suam.utils.validate"
        }

        response_data = requests.post(
            self.registration_url,
            json = req_body,
            headers = headers
        )

        
        response_result = response_data.json()
 
        if response_result.get("ResponseDescription"):
            self.registered = 1
            frappe.msgprint(response_result.get("ResponseDescription"))
        elif response_result.get("errorMessage"):
            frappe.throw(response_result.get("errorMessage"))
        else:
            frappe.throw("There is an issue with your mpesa configuration!")
   
        return response_data.json()
