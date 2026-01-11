#include <iostream>
#include <string>
#include <regex>
#include <vector>

using namespace std;

string mask_pii(string text) 
{   
    struct MaskingRule
    {
        regex pattern;
        string replacement;
    };

    static const vector<MaskingRule> masking_rules = 
    {
        // Money Amounts
        {regex(R"(\$\s?\d{1,3}(,\d{3})*(\.\d{2})?)"), "[AMOUNT_REDACTED]"}, 
        // Email Addresses
        {regex(R"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"), "[EMAIL_REDACTED]"},
        // Phone Numbers
        {regex(R"((\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})"), "[PHONE_REDACTED]"},
        // Social Security Numbers (SSNs)
        {regex(R"(\b\d{3}-\d{2}-\d{4}\b)"), "[SSN_REDACTED]"},
        //Dates of Birth (Strict Formats)
            // A. Standard Slashes (01/01/2000)
            {regex(R"(\b\d{1,2}/\d{1,2}/\d{2,4}\b)"), "[DATE_REDACTED]"},
            // B. ISO Dashes (2000-01-01)
            {regex(R"(\b\d{4}-\d{2}-\d{2}\b)"), "[DATE_REDACTED]"},
            // C. Written English (January 1, 2000)
            {regex(R"(\b[A-Z][a-z]{2,}\s+\d{1,2},?\s+\d{4}\b)"), "[DATE_REDACTED]"},
        // Credit Card Numbers
        {regex(R"(\b(?:\d{4}[ -]?){3}\d{4}\b)"), "[CC_REDACTED]"},
        // Mask IPv4 Addresses
        //IPv4 Addresses
        {regex(R"(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)"), "[IPV4_REDACTED]"},
        //IPv6 Addresses
        {regex(R"((([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])))"), "[IPV6_REDACTED]"},
        //IBANs (International Finance)
        {regex(R"(\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b)"), "[IBAN_REDACTED]"},
        //VINs (Vehicle Identification Numbers)
        {regex(R"(\b[(A-H|J-N|P|R-Z|0-9)]{17}\b)"), "[VIN_REDACTED]"},  
    };

    for (const auto& rule : masking_rules)
    {
        text = regex_replace(text, rule.pattern, rule.replacement);
    }

    return text;
}