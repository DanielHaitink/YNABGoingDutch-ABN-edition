// Add new drop area for drag and drop behaviour
new DropArea((files) => {

    const parseFiles = () => {
        for (const file of files)
            parseFile(file);
    };

    parseFiles();
});

/**
 * Parse the files in the input field, selected with the input button.
 */
const parse = function () {
    const _input = document.getElementById("drop-input");

    const parseFiles = () => {
        for (const file of _input.files)
            parseFile(file);

        _input.value = "";
    };


    parseFiles();
};

// Parse every file as a stream
/**
 * Parse a file as a stream.
 * @param file {File} A file that should be converted.
 */
const parseFile = function (file) {
    const _converter = new YNABConverter();

    new CSVGood(file,
        (result) => {
            _converter.convert(result);
        },
        (error) => {
            _converter.handleError(error, file);
        },
        (result) => {
            _converter.complete(result);
        }
    );
};

/**
 * Holds data of the eventual CSV file, in YNAB format.
 * @param accountNumber {String} The unique number of the bank account.
 * @constructor
 */
const YNABAccountData = function (accountNumber) {
    let _csvData = [
        ["Date", "Payee", "Category", "Memo", "Outflow", "Inflow"]
    ];

    /**
     * Add a line to the CSV.
     * @param data {Array} An array of strings.
     */
    this.addLine = (data) => {
        if (YNABAccountData.DATA_DIMENSION !== data.length) {
            console.error("Data is of the wrong size!");
            return;
        }

        _csvData.push(data);
    };

    /**
     * Prompt a download for the new CSV file.
     */
    this.downloadCSV = () => {
        let blobText = "";

        for (const line of _csvData) {
            for (const item of line) {
                blobText += "\"" + item + "\"";

                if (item !== line[line.length - 1])
                    blobText += ",";
            }
            blobText += "\r\n";
        }

        const date = new Date().toJSON().slice(0,10).replace(/-/g,"\/");
        const fileName = accountNumber + "_" + date + ".csv";
        const blob = new Blob([blobText], {
            type: "text/csv;charset=utf-8;"
        });

        if (navigator.msSaveBlob) { // IE 10+
            navigator.msSaveBlob(blob, fileName);
        } else {
            const link = document.createElement("a");

            if (link.download !== undefined) {
                let url = URL.createObjectURL(blob);

                link.setAttribute("href", url);
                link.setAttribute("download", fileName);
                link.style.visibility = "hidden";

                document.body.appendChild(link);

                link.click();
            }
        }
    };
};

YNABAccountData.DATA_DIMENSION = 6;


/**
 *
 * @constructor
 */
const BankMapperABN = function () {
    let date, outflow, inflow, payee, account, memo;

    // Check whether the indicator is negative
    const isIndicatorNegative = function (text) {
        return text.includes("-");
    };

    /**
     * Get the bank type of this BankMapperABN.
     * @return {String} The key of the bank.
     */
    this.getBank = () => "ABN";

    /**
     * Get the account number of the current line.
     * @return {string} The account number.
     */
    this.getAccount = () => account || "";

    /**
     * Return the date in the european format of the current line(DD-MM-YYYY)
     * @return {string} The date.
     */
    this.getDate = () => date;

    /**
     * Get the payee of the current line
     * @return {string} The payee.
     */
    this.getPayee = () => payee || "";

    /**
     * Get the category of the current line
     * @return {string} The category.
     */
    this.getCategory = () => "";

    /**
     * Get the memo of the current line
     * @return {string} The Memo.
     */
    this.getMemo = () => memo || "";


        /**
     * Get the inflow of the current line
     * @return {string} The inflow.
     */
    this.getInflow = () => inflow || "0";

    /**
     * Get the outflow of the current line
     * @return {string} The outflow.
     */
    this.getOutflow = () => outflow || "0";

    /**
     * Has to be called to parse a new line.
     * @param line {string}
     */
    this.parseLine = (line) => {
        const clearInfo = () => {
            date = outflow = inflow = payee = account = memo = "";
        };

        const parseDate = (text) => {
            const dateFormat = "YYYYMMDD";

            if (dateFormat === BankMapperABN.DEFAULT_DATE_FORMAT)
                return text;

            let year = "";
            let month = "";
            let day = "";
            for (let index = 0; index < dateFormat.length; ++index) {
                switch (dateFormat.charAt(index)) {
                    case "Y":
                        year += text.charAt(index);
                        break;
                    case "M":
                        month += text.charAt(index);
                        break;
                    case "D":
                        day += text.charAt(index);
                        break;
                }
            }

            date = year + "-" + month + "-" + day;
        };

        const parseFlow = (text) => {

            if (isIndicatorNegative(text)) {
                text = text.replace("-", "");
                text = text.replace(",", ".");

                outflow = text;
                inflow = "0";
            } else {
                text = text.replace(",", ".");
                inflow = text;
                outflow = "0";
            }

            return "0";
        };

        const parseTrashField = function (field) {
            const findSlashField = (matches, name) => {
                for (let i = 0; i < matches.length; i++) {
                    if (matches[i][0].includes(name) && i + 1 < matches.length) {
                        return matches[i + 1][1];
                    }
                }

                return "";
            };

            if (field.startsWith("BEA")) {
                const regex = /(?:\/\d+\.\d+\s)(.+?)(?:,PAS)/g;
                const match = regex.exec(field)// Only obtains name
                payee = match[1];
            } else if (field.startsWith("/")) {
                const match = Array.from(field.matchAll(/(?:\/?)(.*?)(?:\/|\s+$)/g));
                payee = findSlashField(match, "NAME") +  ' ' + findSlashField(match, "IBAN");
                memo = findSlashField(match, "REMI") + "\t" + findSlashField(match, "CSID") || findSlashField(match, "IBAN");
            } else if (field.startsWith("ABN")) {
                const match = Array.from(field.matchAll(/(.+?)(?:\s{2,}|$)/g));
                //    0 is name, 1 is description
                if (match.length >= 3) {
                    payee = match[0][1];
                    memo = match[1][1];
                }
            } else if (field.startsWith("STORTING BELEG. FONDS ")) {
                // Extract details of "Beleggen" order
                const match = Array.from(field.matchAll(/(.+?)(?:\s{2,}|$|\sFONDSCODE)/g));
                //    0 is name of fund, 3 is order details
                if (match.length >= 4) {
                    payee = match[0][1].substring(22);
                    memo = match[3][1];
                }
            } else {
                //    ERROR!
            }
        };

        clearInfo();
        account = line[0];
        parseDate(line[2]);
        parseFlow(line[6]);
        parseTrashField(line[7]);
    }
};

BankMapperABN.DEFAULT_DATE_FORMAT = "YYYY-MM-DD";


/**
 * Converts a streamed CSV file to the desired format
 * @constructor
 */
const YNABConverter = function () {
    const _accounts = {}; // All the different account numbers in the file
    let _bankMapper = new BankMapperABN(); // The bank mapping for the file
    let _hasConversionFailed = false;

    // Convert the current CSV line
    const convertLine = (line) => {
        _bankMapper.parseLine(line);

        const account = _bankMapper.getAccount();

        // If account has not been seen before, create new account
        if (_accounts[account] == null)
            _accounts[account] = new YNABAccountData(account);

        const dataRow = [
            _bankMapper.getDate(),
            _bankMapper.getPayee(),
            _bankMapper.getCategory(),
            _bankMapper.getMemo(),
            _bankMapper.getOutflow(),
            _bankMapper.getInflow()
        ];

        _accounts[account].addLine(dataRow);
    };

    /**
     * Covert the file stream per chunk given.
     * @param results {FileStreamerResultStep} Result of the convertion.
     */
    this.convert = function (results) {
        if (_hasConversionFailed)
            return;

        // Loop through all the data
        for (let index = 0, line; line = results.rows[index]; ++index) {
            // check for error
            if (line.error !== null)
                continue;

            convertLine(line.data);
        }
    };

    /**
     * Handle occurred errors.
     * @param error {string} Error message.
     * @param file {File} The file in which the error occurred.
     */
    this.handleError = function (error, file) {
        if (_hasConversionFailed)
            return;

        notie.alert({type: "error", text: "An error occurred in file " + file.name + ": " + error, position: "bottom"});
    };

    /**
     * Completes the conversion and downloads the CSVs.
     * @param result {FileStreamerResultComplete} The information of the completed stream.
     */
    this.complete = function (result) {
        if (_hasConversionFailed)
            return;

        notie.alert({type: "success", text: result.file.name + " is completed successfully. Converted as " +
                _bankMapper.getBank(), position: "bottom"});

        const keys = Object.keys(_accounts);

        for (let index = 0, account; account = _accounts[keys[index]]; ++index) {
            account.downloadCSV();
        }
    };
};
