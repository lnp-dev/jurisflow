#include <iostream>
#include <string>
#include <regex>
#include <vector>
#include <unordered_map>

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

namespace py = pybind11;
using namespace std;
using namespace py;


 struct RegexPattern
{
    string pii_type;
    regex exp;
};

class PiiMasker
{
private:
    //stores the mapping from original PII to unique tokens
    unordered_map<string, string> token_vault;
    //stores counters for each PII type
    unordered_map<string, int> counters;

    //Return matching token from vault or create a new one
    string get_or_create_token(const string& raw_pii, const string& pii_type)
    {
        if (token_vault.find(raw_pii) != token_vault.end())
        {
            return token_vault[raw_pii];
        }
        else
        {
            string token = "[" + pii_type + "_" + to_string(++counters[pii_type]) + "]";
            token_vault[raw_pii] = token;
            return token;
        }
    }

public:

    PiiMasker() {}
    
    static const vector<RegexPattern> regex_patterns;

    //Returns text with sensitive PII tokenized and redacted.
    string mask_sensitive_pii(string text) 
    {   
        string redacted_text;
        for (const auto& pattern: regex_patterns)
        {
            string result;
            auto it = sregex_iterator(text.begin(), text.end(), pattern.exp);
            auto end = sregex_iterator();

            size_t last_pos = 0;
            for(; it != end; ++it)
            {
                smatch match = *it;
                result += text.substr(last_pos, match.position() - last_pos);
                
                //Get unique token for this specific match
                string token = get_or_create_token(match.str(), pattern.pii_type);
                result += token;
                last_pos = match.position() + match.length();
            }
            result += text.substr(last_pos);
            text = result;
        }
        return text;
    }

    //Returns the map of original PII to unique tokens
    unordered_map<string, string> get_map()
    {
        return token_vault;
    }

};

const vector<RegexPattern> PiiMasker::regex_patterns= 
{
    {"EMAIL", regex(R"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})")},
    {"PHONE", regex(R"((\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})")},
    {"SSN", regex(R"(\b\d{3}-\d{2}-\d{4}\b)")},
    {"CREDIT_CARD", regex(R"(\b(?:\d{4}[ -]?){3}\d{4}\b)")},
    {"IPV4", regex(R"(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)")},
    {"IPV6", regex(R"((([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])))")},
    {"IBAN", regex(R"(\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b)")},
    {"VIN", regex(R"(\b[(A-H|J-N|P|R-Z|0-9)]{17}\b)")}, 
    
    //Add more regex patterns as necessary later to improve JurisFlow's PII detection capabilities
};


PYBIND11_MODULE(juris_core, m) 
{
    class_<PiiMasker>(m, "PiiMasker")
        .def(init<>())
        .def("mask_sensitive_pii", &PiiMasker::mask_sensitive_pii)
        .def("get_map", &PiiMasker::get_map);
}



